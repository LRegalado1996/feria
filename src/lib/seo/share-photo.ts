import { type BlobNamespace, isOwnBlobUrl } from "@/lib/blob/paths";
import { captureExceptionWithScope } from "@/lib/sentry";
import { ownUrl } from "@/lib/seo/origin";

/** Well inside a crawler's patience for the whole card. */
export const SHARE_PHOTO_TIMEOUT_MS = 3000;

/** Past any photo the wizard uploads (2400 px a side, re-encoded). */
export const SHARE_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

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

/**
 * The first bytes each accepted type starts with. A body that claims to be
 * a photo but is not one would fail the renderer after this helper returns,
 * the whole card's failure; it is the block here instead.
 */
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (bytes) =>
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes) =>
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, at) => bytes[at] === byte
    ),
  "image/webp": (bytes) =>
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP",
};

/**
 * Lets the rest of a body go unread, without waiting for the connection to
 * agree: a refused photo is the block at once. Cancelling a stream this
 * code holds (unlocked, or through its own reader) does not reject.
 */
function dropBody(
  body: ReadableStream | ReadableStreamDefaultReader | null | undefined
): void {
  void body?.cancel();
}

/**
 * The body's bytes, read as they arrive and given up on past
 * `SHARE_PHOTO_MAX_BYTES`: a large body is never held whole in memory.
 */
async function readCapped(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));

  if (declared > SHARE_PHOTO_MAX_BYTES) {
    dropBody(response.body);
    throw new Error("The photo is larger than a share card takes");
  }

  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const chunk = await reader?.read();

    if (!chunk || chunk.done) {
      break;
    }

    size += chunk.value.byteLength;

    if (size > SHARE_PHOTO_MAX_BYTES) {
      dropBody(reader);
      throw new Error("The photo is larger than a share card takes");
    }

    chunks.push(chunk.value);
  }

  const bytes = new Uint8Array(size);
  let at = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }

  return bytes;
}

/** Fetches a photo of this site or its Blob store, refusing anything that is not one. */
async function fetchPhoto(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    dropBody(response.body);
    throw new Error(`The photo's server answered ${response.status}`);
  }

  const type = response.headers.get("content-type")?.split(";")[0]?.trim();
  const looksLike = type === undefined ? undefined : SIGNATURES[type];

  if (looksLike === undefined) {
    dropBody(response.body);
    throw new Error(
      "The photo's server answered something that is not a photo"
    );
  }

  const bytes = await readCapped(response);

  if (!looksLike(bytes)) {
    throw new Error("The photo's bytes are not the type its server named");
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
