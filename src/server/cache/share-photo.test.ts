import { describe, expect, test, vi } from "vitest";

import { readSharePhoto } from "./share-photo";

const { cacheLife, readBlobStore, sharePhotoSource } = vi.hoisted(() => ({
  cacheLife: vi.fn<(profile: string) => void>(),
  readBlobStore: vi.fn(
    (): { host: string; namespace: "production"; token: string } | null => null
  ),
  sharePhotoSource: vi.fn(
    async (_url: string, _options: unknown): Promise<string | null> =>
      await Promise.resolve("data:image/webp;base64,AA==")
  ),
}));

// Outside a Next render `"use cache"` is a plain string: the function runs.
vi.mock("next/cache", () => ({ cacheLife }));
vi.mock("@/server/api/utils/blob-store", () => ({ readBlobStore }));
vi.mock("@/lib/seo/share-photo", () => ({ sharePhotoSource }));

const HOST = "store123.public.blob.vercel-storage.com";
const PHOTO = `https://${HOST}/production/product/a.webp`;
const ORIGIN = "https://market.example.com";

/** The deployment with its Blob store, or without one. */
function setup({ withStore = true }: { withStore?: boolean } = {}) {
  readBlobStore.mockReturnValueOnce(
    withStore
      ? {
          host: HOST,
          namespace: "production",
          token: "vercel_blob_rw_store123_secret",
        }
      : null
  );
}

describe("readSharePhoto", () => {
  test("answers what the card draws, cached for an hour, the Blob store's token left out of the cache key", async () => {
    setup();

    await expect(readSharePhoto(PHOTO, ORIGIN)).resolves.toBe(
      "data:image/webp;base64,AA=="
    );
    expect(sharePhotoSource).toHaveBeenCalledExactlyOnceWith(PHOTO, {
      blobStore: { host: HOST, namespace: "production" },
      origin: ORIGIN,
    });
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  test("without a Blob store, asks with none", async () => {
    setup({ withStore: false });

    await readSharePhoto(PHOTO, ORIGIN);

    expect(sharePhotoSource).toHaveBeenCalledExactlyOnceWith(PHOTO, {
      blobStore: null,
      origin: ORIGIN,
    });
  });
});
