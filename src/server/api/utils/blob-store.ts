import { ORPCError } from "@orpc/server";

import { env } from "@/env";
import { blobStoreHost } from "@/lib/blob/host";
import { blobNamespace } from "@/lib/blob/paths";
import { ERROR_WHYS } from "@/lib/errors";
import { keepAlivePastResponse } from "@/server/api/utils/keep-alive-past-response";
import { safeRequestLogger } from "@/server/api/utils/logger";
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
 * token). A deployment without the token is misconfigured (FER-051): a typed
 * `SERVICE_UNAVAILABLE` whose `why` the uploader turns into a plain sentence,
 * and the client reports once (`useImageUpload`), rather than a 500 the
 * interceptor would report as a crash. The request's log line says so.
 */
export function requireBlobStore(): BlobStore {
  const blobStore = readBlobStore();

  if (!blobStore) {
    safeRequestLogger()?.set({ upload: { configured: false } });
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      data: { why: ERROR_WHYS.UPLOADS_NOT_CONFIGURED },
      message: "Image uploads are not configured on this server",
    });
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
