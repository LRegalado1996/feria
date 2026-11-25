import { type BlobNamespace, isOwnBlobUrl } from "@/lib/blob/paths";
import { captureExceptionWithScope } from "@/lib/sentry";
import { ownUrl } from "@/lib/seo/origin";

/** Well inside a crawler's patience for the whole card. */
export const SHARE_PHOTO_TIMEOUT_MS = 3000;

/** Past any photo the wizard uploads (2400 px a side, re-encoded). */
export const SHARE_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * The photos that already failed on this server instance: a crawler asks
 * for the same card again and again, and one report per photo is enough.
 */
const reported = new Set<string>();

interface SharePhotoOptions {
  /** This deployment's Blob store (`readBlobStore()`), or `null` without one. */
  blobStore: { host: string; namespace: BlobNamespace } | null;
  /** This site's origin, for a photo stored on it (the seed's). */
  origin: string;
  timeoutMs?: number;
}

/** Fetches a photo of this site or its Blob store, refusing anything that is not one. */
async function fetchPhoto(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`The photo's server answered ${response.status}`);
  }

  const type = response.headers.get("content-type")?.split(";")[0]?.trim();

  if (type === undefined || !PHOTO_TYPES.has(type)) {
    throw new Error(
      "The photo's server answered something that is not a photo"
    );
  }

  const bytes = await response.arrayBuffer();

  if (bytes.byteLength > SHARE_PHOTO_MAX_BYTES) {
    throw new Error("The photo is larger than a share card takes");
  }

  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * What an article's share card draws for its photo (FER-049): a photo on
 * this site (the seed's) or of this deployment's own Blob store, fetched
 * here within `timeoutMs` and handed over as a data address; anything else
 * `null`, the card's plain block. The renderer never fetches a photo
 * itself: it refuses a private address such as `localhost`, and its failure
 * is the whole card's (a 500) where this one's is the block. Only this
 * site's addresses and those that pass `isOwnBlobUrl` are ever fetched, so
 * a row naming another host (or the cloud's metadata address) cannot make
 * the server fetch it. A photo that fails, is slow or is not a photo is the
 * block too, reported once per server instance rather than per crawler hit.
 */
export async function sharePhotoSource(
  url: string,
  { blobStore, origin, timeoutMs = SHARE_PHOTO_TIMEOUT_MS }: SharePhotoOptions
): Promise<string | null> {
  const source =
    ownUrl(url, origin) ??
    (blobStore && isOwnBlobUrl(url, { ...blobStore, purpose: "product" })
      ? url
      : null);

  if (source === null) {
    return null;
  }

  try {
    return await fetchPhoto(source, timeoutMs);
  } catch (error) {
    if (!reported.has(url)) {
      reported.add(url);
      captureExceptionWithScope(error, { action: "ShareCard.fetch_photo" });
    }

    return null;
  }
}
