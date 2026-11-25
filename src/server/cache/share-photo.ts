import { cacheLife } from "next/cache";

import { sharePhotoSource } from "@/lib/seo/share-photo";
import { readBlobStore } from "@/server/api/utils/blob-store";

/**
 * What an article's share card draws for its photo (FER-049,
 * `sharePhotoSource`), cached across requests. The card is static output
 * (`opengraph-image.tsx`, a metadata route): under Cache Components a fetch
 * no cache holds stops its prerender and the card answers 500, as it did in
 * production on 2026-11-25. Cached here, the photo is part of the static
 * card. An uploaded photo's address never changes its bytes, so an hour is
 * a safety net for a failed fetch, which caches the plain block until then.
 * The Blob store's token stays out of the cache key: only its host and
 * folder are passed.
 */
export async function readSharePhoto(
  url: string,
  origin: string
): Promise<string | null> {
  const store = readBlobStore();

  return await readCachedSharePhoto(
    url,
    store ? { host: store.host, namespace: store.namespace } : null,
    origin
  );
}

async function readCachedSharePhoto(
  url: string,
  blobStore: Parameters<typeof sharePhotoSource>[1]["blobStore"],
  origin: string
): Promise<string | null> {
  "use cache";
  cacheLife("hours");

  return await sharePhotoSource(url, { blobStore, origin });
}
