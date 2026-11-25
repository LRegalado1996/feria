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
/** A WebP's first bytes ("RIFF", a size, "WEBP") and a little more. */
const PHOTO = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3,
]);
/** A JPEG's first bytes and a little more. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

/** `size` bytes that start like a JPEG. */
function jpegOf(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(JPEG.subarray(0, 4));

  return bytes;
}

/** A body that arrives in `chunks` pieces of `size` bytes, with no length. */
function streamOf(chunks: number, size: number): ReadableStream<Uint8Array> {
  let sent = 0;

  return new ReadableStream({
    pull(controller) {
      if (sent === chunks) {
        controller.close();
        return;
      }

      controller.enqueue(sent === 0 ? jpegOf(size) : new Uint8Array(size));
      sent += 1;
    },
  });
}

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
          return new HttpResponse(JPEG, {
            headers: { "content-type": "image/jpeg" },
          });
        })
      );

      await expect(
        sharePhotoSource(address, { blobStore: BLOB_STORE, origin: ORIGIN })
      ).resolves.toBe(
        `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`
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
        new HttpResponse(jpegOf(SHARE_PHOTO_MAX_BYTES + 1), {
          headers: { "content-type": "image/jpeg" },
        }),
      "The photo is larger than a share card takes",
    ],
    [
      "a body past the size that names no length, given up on as it arrives",
      () =>
        new HttpResponse(streamOf(9, 1024 * 1024), {
          headers: { "content-type": "image/jpeg" },
        }),
      "The photo is larger than a share card takes",
    ],
    [
      "bytes that are not the type the server named",
      () =>
        new HttpResponse(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/webp" },
        }),
      "The photo's bytes are not the type its server named",
    ],
    [
      "a PNG's name over a JPEG's bytes",
      () =>
        new HttpResponse(JPEG, { headers: { "content-type": "image/png" } }),
      "The photo's bytes are not the type its server named",
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

  test.each([
    ["in one piece", () => jpegOf(SHARE_PHOTO_MAX_BYTES)],
    ["in pieces, naming no length", () => streamOf(8, 1024 * 1024)],
  ])("a photo exactly at the size limit is drawn, %s", async (_how, body) => {
    const { source } = setup({
      answer: () =>
        new HttpResponse(body(), {
          headers: { "content-type": "image/jpeg; charset=binary" },
        }),
    });

    // Every byte, in order: both bodies are the same 8 MiB once joined.
    await expect(source()).resolves.toBe(
      `data:image/jpeg;base64,${Buffer.from(jpegOf(SHARE_PHOTO_MAX_BYTES)).toString("base64")}`
    );
  });

  test("a body that says it is past the size is not read at all", async () => {
    let pulled = 0;
    const { source } = setup({
      answer: () =>
        new HttpResponse(
          new ReadableStream({
            pull(controller) {
              pulled += 1;
              controller.enqueue(jpegOf(1024));
            },
          }),
          {
            headers: {
              "content-length": String(SHARE_PHOTO_MAX_BYTES + 1),
              "content-type": "image/jpeg",
            },
          }
        ),
    });

    await expect(source()).resolves.toBeNull();
    // Only what the stream buffered on its own: read to the limit, it would
    // take over 8,000 pieces of 1 KB.
    expect(pulled).toBeLessThan(10);
  });

  test.each([
    ["a PNG", "image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]],
    ["a JPEG", "image/jpeg", [0xff, 0xd8, 0xff, 0xdb, 1]],
  ])("%s's own bytes are drawn", async (_type, type, bytes) => {
    const { source } = setup({
      answer: () =>
        new HttpResponse(new Uint8Array(bytes), {
          headers: { "content-type": type },
        }),
    });

    await expect(source()).resolves.toBe(
      `data:${type};base64,${Buffer.from(bytes).toString("base64")}`
    );
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

  test("a refused body that will not be cancelled is still the block at once, its cancel reported, never an unhandled rejection", async () => {
    const gone = new Error("The body already failed");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({
          cancel() {
            throw gone;
          },
        }),
        { status: 503 }
      )
    );
    const url = `https://${HOST}/production/product/${randomUUID()}.webp`;

    await expect(
      sharePhotoSource(url, { blobStore: BLOB_STORE, origin: ORIGIN })
    ).resolves.toBeNull();
    await vi.waitFor(() => {
      expect(captureExceptionWithScope).toHaveBeenCalledWith(gone, {
        action: "ShareCard.drop_photo",
      });
    });
    fetchSpy.mockRestore();
  });

  test("waits three seconds by default and takes photos up to 8 MB", () => {
    expect([SHARE_PHOTO_TIMEOUT_MS, SHARE_PHOTO_MAX_BYTES]).toEqual([
      3000,
      8 * 1024 * 1024,
    ]);
  });
});
