import { randomUUID } from "node:crypto";

import { delay, HttpResponse, http } from "msw";
import { describe, expect, test, vi } from "vitest";

import { server } from "@/test/msw";

import {
  SHARE_PHOTO_MAX_BYTES,
  SHARE_PHOTO_TIMEOUT_MS,
  sharePhotoSource,
} from "./share-photo";

const { captureExceptionWithScope } = vi.hoisted(() => ({
  captureExceptionWithScope:
    vi.fn<(error: unknown, scope: { action: string }) => string | null>(),
}));

vi.mock("@/lib/sentry", () => ({ captureExceptionWithScope }));

const HOST = "store123.public.blob.vercel-storage.com";
const ORIGIN = "https://market.example.com";
const BLOB_STORE = { host: HOST, namespace: "production" as const };
/** A few bytes that stand for a photo: the card only passes them on. */
const PHOTO = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]);

/**
 * A photo address of this deployment's store (each test its own, since a
 * failure is reported once per address), and the Blob store answering it
 * as the test says; `requests` counts what reached it.
 */
function setup({
  answer = () =>
    new HttpResponse(PHOTO, { headers: { "content-type": "image/webp" } }),
  host = HOST,
  path = `/production/product/${randomUUID()}.webp`,
}: {
  answer?: () => Promise<Response> | Response;
  host?: string;
  path?: string;
} = {}) {
  const url = `https://${host}${path}`;
  const requests: string[] = [];
  server.use(
    http.get(`https://${host}/*`, async ({ request }) => {
      requests.push(request.url);
      return await answer();
    })
  );

  return {
    requests,
    source: async (options: { timeoutMs?: number } = {}) =>
      await sharePhotoSource(url, {
        blobStore: BLOB_STORE,
        origin: ORIGIN,
        ...options,
      }),
    url,
  };
}

describe("sharePhotoSource", () => {
  test("a photo of this deployment's Blob store comes back as a data address of its bytes", async () => {
    const { requests, source, url } = setup();

    await expect(source()).resolves.toBe(
      `data:image/webp;base64,${Buffer.from(PHOTO).toString("base64")}`
    );
    expect(requests).toEqual([url]);
  });

  test.each([
    ["by its path", "/seed/ring-1.jpg"],
    ["by its whole address", `${ORIGIN}/seed/ring-1.jpg`],
  ])(
    "a photo on this site, %s, is fetched here too and comes back as a data address: the renderer never fetches it",
    async (_how, address) => {
      const requests: string[] = [];
      server.use(
        http.get(`${ORIGIN}/seed/*`, ({ request }) => {
          requests.push(request.url);
          return new HttpResponse(PHOTO, {
            headers: { "content-type": "image/jpeg" },
          });
        })
      );

      await expect(
        sharePhotoSource(address, { blobStore: BLOB_STORE, origin: ORIGIN })
      ).resolves.toBe(
        `data:image/jpeg;base64,${Buffer.from(PHOTO).toString("base64")}`
      );
      expect(requests).toEqual([`${ORIGIN}/seed/ring-1.jpg`]);
    }
  );

  test("a photo on this site that fails is the block, reported, not the whole card's failure", async () => {
    const path = `/seed/${randomUUID()}.jpg`;
    server.use(
      http.get(
        `${ORIGIN}/seed/*`,
        () => new HttpResponse(null, { status: 404 })
      )
    );

    await expect(
      sharePhotoSource(path, { blobStore: null, origin: ORIGIN })
    ).resolves.toBeNull();
    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "The photo's server answered 404" }),
      { action: "ShareCard.fetch_photo" }
    );
  });

  test.each([
    [
      "another Blob store",
      "other456.public.blob.vercel-storage.com",
      undefined,
    ],
    ["another host", "photos.example.org", undefined],
    ["another deployment's folder", HOST, `/qa/product/${randomUUID()}.webp`],
    [
      "another purpose's folder",
      HOST,
      `/production/banner/${randomUUID()}.webp`,
    ],
  ])(
    "an address in %s is never fetched: the card's block",
    async (_where, host, path) => {
      const { requests, source } = setup({ host, path });

      await expect(source()).resolves.toBeNull();
      expect(requests).toEqual([]);
    }
  );

  test("without a Blob store, no address is its own: the block, nothing fetched", async () => {
    const { requests, url } = setup();

    await expect(
      sharePhotoSource(url, { blobStore: null, origin: ORIGIN })
    ).resolves.toBeNull();
    expect(requests).toEqual([]);
  });

  test.each([
    [
      "an error status",
      () => new HttpResponse(null, { status: 503 }),
      "The photo's server answered 503",
    ],
    [
      "something that is not a photo",
      () =>
        new HttpResponse("<html></html>", {
          headers: { "content-type": "text/html" },
        }),
      "The photo's server answered something that is not a photo",
    ],
    [
      "a photo past the size a card takes",
      () =>
        new HttpResponse(new Uint8Array(SHARE_PHOTO_MAX_BYTES + 1), {
          headers: { "content-type": "image/jpeg" },
        }),
      "The photo is larger than a share card takes",
    ],
  ])(
    "%s is the block, reported once however often the card is asked for",
    async (_case, answer, message) => {
      const { source } = setup({ answer });

      await expect(source()).resolves.toBeNull();
      await expect(source()).resolves.toBeNull();

      expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ message }),
        { action: "ShareCard.fetch_photo" }
      );
    }
  );

  test("a photo exactly at the size limit is drawn", async () => {
    const { source } = setup({
      answer: () =>
        new HttpResponse(new Uint8Array(SHARE_PHOTO_MAX_BYTES), {
          headers: { "content-type": "image/jpeg; charset=binary" },
        }),
    });

    await expect(source()).resolves.toMatch(/^data:image\/jpeg;base64,/u);
  });

  test("a photo slower than the time limit is the block, reported as a timeout", async () => {
    const { source } = setup({
      answer: async () => {
        await delay("infinite");
        return new HttpResponse(PHOTO);
      },
    });

    await expect(source({ timeoutMs: 20 })).resolves.toBeNull();
    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "TimeoutError" }),
      { action: "ShareCard.fetch_photo" }
    );
  });

  test("waits three seconds by default and takes photos up to 8 MB", () => {
    expect([SHARE_PHOTO_TIMEOUT_MS, SHARE_PHOTO_MAX_BYTES]).toEqual([
      3000,
      8 * 1024 * 1024,
    ]);
  });
});
