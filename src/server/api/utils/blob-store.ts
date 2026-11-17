import { env } from "@/env";
import { blobStoreHost } from "@/lib/blob/host";
import { blobNamespace } from "@/lib/blob/paths";
import { keepAlivePastResponse } from "@/server/api/utils/keep-alive-past-response";
import type { DatabaseClient } from "@/server/db";
import { type BlobStore, deleteBlobs } from "@/server/services/upload";

/**
 * This deployment's Blob store, from `BLOB_READ_WRITE_TOKEN` and the
 * deployment's folder, or `null` where no token is set (CI, a machine that
 * never pulled one): nothing can be uploaded there, and no address is its
 * own, so nothing is ever deleted.
 */
export function readBlobStore(
  token: string | undefined = env.BLOB_READ_WRITE_TOKEN,
  deployEnv: Record<string, string | undefined> = process.env
): BlobStore | null {
  const host = blobStoreHost(token);

  return token && host
    ? { host, namespace: blobNamespace(deployEnv), token }
    : null;
}

/**
 * `readBlobStore` for a request that cannot work without one (a client
 * token): a deployment without the token is misconfigured, a 500 the
 * interceptor reports, never a refusal the admin could fix.
 */
export function requireBlobStore(): BlobStore {
  const blobStore = readBlobStore();

  if (!blobStore) {
    throw new Error("BLOB_READ_WRITE_TOKEN is missing or malformed");
  }

  return blobStore;
}

/**
 * Deletes the files of rows a write just removed, once it committed, after
 * the response: the write never waits on the Blob store or fails for it. A
 * deletion that fails is reported, and the file it left is an orphan the
 * scheduled cleanup removes (`cleanUpOrphanBlobs`). A file another row
 * still shows is kept (`deleteBlobs`).
 */
export function discardBlobs(
  db: DatabaseClient,
  urls: readonly string[]
): void {
  const blobStore = readBlobStore();

  if (!blobStore || urls.length === 0) {
    return;
  }

  keepAlivePastResponse(deleteBlobs(db, blobStore, urls), {
    action: "Upload.discard_blobs",
  });
}
