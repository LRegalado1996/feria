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

/** Fetches a photo of the Blob store, refusing anything that is not one. */
async function fetchPhoto(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`The Blob store answered ${response.status}`);
  }

  const type = response.headers.get("content-type")?.split(";")[0]?.trim();

  if (type === undefined || !PHOTO_TYPES.has(type)) {
    throw new Error("The Blob store answered something that is not a photo");
  }

  const bytes = await response.arrayBuffer();

  if (bytes.byteLength > SHARE_PHOTO_MAX_BYTES) {
    throw new Error("The photo is larger than a share card takes");
  }

  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * What an article's share card draws for its photo (FER-049): a photo on
 * this site as its own address, which the renderer fetches; a photo of this
 * deployment's own Blob store fetched here, within `timeoutMs`, and handed
 * over as a data address; anything else `null`, the card's plain block.
 * Only an address that passes `isOwnBlobUrl` is ever fetched, so a row
 * naming another host (or the cloud's metadata address) cannot make the
 * server fetch it. A photo that fails, is slow or is not a photo is the
 * block too, reported once per server instance rather than per crawler hit.
 */
export async function sharePhotoSource(
  url: string,
  { blobStore, origin, timeoutMs = SHARE_PHOTO_TIMEOUT_MS }: SharePhotoOptions
): Promise<string | null> {
  const onSite = ownUrl(url, origin);

  if (onSite) {
    return onSite;
  }

  if (!blobStore || !isOwnBlobUrl(url, { ...blobStore, purpose: "product" })) {
    return null;
  }

  try {
    return await fetchPhoto(url, timeoutMs);
  } catch (error) {
    if (!reported.has(url)) {
      reported.add(url);
      captureExceptionWithScope(error, { action: "ShareCard.fetch_photo" });
    }

    return null;
  }
}
