import { randomUUID } from "node:crypto";

import { del, list } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { ilike } from "drizzle-orm";

import {
  type BlobNamespace,
  blobPathname,
  isOwnBlobUrl,
} from "@/lib/blob/paths";
import {
  type CreateUploadTokenValues,
  UPLOAD_TOKEN_TTL_MS,
} from "@/lib/schemas/upload";
import type { DatabaseClient } from "@/server/db";
import { category, productImage, store } from "@/server/db/schema";

/**
 * The Blob store a deployment writes to: its read-write token (server only),
 * the public host its files are served from and its own folder in it.
 */
export interface BlobStore {
  host: string;
  namespace: BlobNamespace;
  token: string;
}

/**
 * Every column that holds the address of an uploaded image. The orphan
 * cleanup deletes any file of the deployment's folder that none of them
 * names, so a column missing here would have its images deleted: a new
 * consumer adds its column in the same change (`upload.test.ts` fails on a
 * column of the schema named like one and missing here).
 */
export const IMAGE_URL_COLUMNS = [
  productImage.url,
  category.coverUrl,
  category.coverPhoneUrl,
  store.catalogCoverUrl,
  store.catalogCoverPhoneUrl,
] as const;

/**
 * A client token for one upload (FER-011): the browser sends the file
 * straight to the Blob store with it, since a function's body is capped at
 * 4.5 MB on Vercel. The server picks the file's name (a new UUID under the
 * deployment's folder and the purpose's) and signs the declared type and
 * size into the token, so the store refuses anything else; the token lapses
 * after `UPLOAD_TOKEN_TTL_MS` and never overwrites a file.
 */
export async function issueUploadToken(
  blobStore: BlobStore,
  { contentType, purpose, size }: CreateUploadTokenValues
) {
  const pathname = blobPathname({
    contentType,
    id: randomUUID(),
    namespace: blobStore.namespace,
    purpose,
  });
  const token = await generateClientTokenFromReadWriteToken({
    addRandomSuffix: false,
    allowOverwrite: false,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: size,
    pathname,
    token: blobStore.token,
    validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
  });

  return { pathname, token };
}

/**
 * Deletes the files among `urls` that this deployment uploaded and that no
 * row names any more, and only those: a seed's local path, another store's
 * address, or a file another row still shows is left alone. Read after the
 * write that dropped them committed. Answers the addresses it deleted.
 */
export async function deleteBlobs(
  db: DatabaseClient,
  blobStore: BlobStore,
  urls: readonly string[]
): Promise<string[]> {
  const own = [...new Set(urls)].filter((url) => isOwnBlobUrl(url, blobStore));

  if (own.length === 0) {
    return [];
  }

  const referenced = await listReferencedPathnames(db, blobStore);
  const unused = own.filter(
    (url) => !referenced.has(new URL(url).pathname.slice(1))
  );

  if (unused.length > 0) {
    await del(unused, { token: blobStore.token });
  }

  return unused;
}

/**
 * The pathnames (`qa/cover/<id>.webp`) of this deployment's files that a row
 * still names, read from every column in `IMAGE_URL_COLUMNS`. Compared by
 * pathname, not by the whole address, so a host or a scheme written in
 * capitals still counts as a reference. Every column is read in one
 * snapshot: a cover moved from one column to another between two reads
 * would otherwise be missed by both. `db` is the top-level client, never a
 * transaction: Postgres sets no isolation level on a savepoint.
 */
async function listReferencedPathnames(
  db: DatabaseClient,
  blobStore: BlobStore
): Promise<Set<string>> {
  const referenced = new Set<string>();
  // The ILIKE only narrows the read; `isOwnBlobUrl` decides.
  const pattern = `https://%/${blobStore.namespace}/%`;

  await db.transaction(
    async (tx) => {
      for (const column of IMAGE_URL_COLUMNS) {
        const rows = await tx
          .select({ url: column })
          .from(column.table)
          .where(ilike(column, pattern));

        for (const { url } of rows) {
          // The ILIKE leaves no NULL; the check is for the column's type.
          if (url !== null && isOwnBlobUrl(url, blobStore)) {
            referenced.add(new URL(url).pathname.slice(1));
          }
        }
      }
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );

  return referenced;
}

/**
 * How old an unreferenced file must be before the scheduled cleanup deletes
 * it: a photo uploaded into a form that is saved within two days is safe.
 */
export const ORPHAN_BLOB_MIN_AGE_MS = 2 * 24 * 60 * 60 * 1000;

/** At most this many addresses per delete request. */
const DELETE_BATCH_SIZE = 100;

/**
 * Deletes the deployment's files that no row names and that were uploaded
 * before `olderThan` (FER-011's scheduled job). The age spares an upload
 * whose form has not been saved yet. The store is listed first and the rows
 * read after, so a file saved meanwhile is seen as referenced. Answers how
 * many files it looked at and the pathnames it deleted.
 */
export async function cleanUpOrphanBlobs(
  db: DatabaseClient,
  blobStore: BlobStore,
  { olderThan }: { olderThan: Date }
) {
  const candidates: { pathname: string; url: string }[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({
      cursor,
      prefix: `${blobStore.namespace}/`,
      token: blobStore.token,
    });

    for (const blob of page.blobs) {
      // Only a file this deployment uploaded is ever deleted: anything else
      // in its folder (put there by hand or by another tool) is left alone.
      if (blob.uploadedAt < olderThan && isOwnBlobUrl(blob.url, blobStore)) {
        candidates.push({ pathname: blob.pathname, url: blob.url });
      }
    }

    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const referenced =
    candidates.length > 0
      ? await listReferencedPathnames(db, blobStore)
      : new Set<string>();
  const orphans = candidates.filter(
    (candidate) => !referenced.has(candidate.pathname)
  );

  for (let start = 0; start < orphans.length; start += DELETE_BATCH_SIZE) {
    await del(
      orphans
        .slice(start, start + DELETE_BATCH_SIZE)
        .map((orphan) => orphan.url),
      { token: blobStore.token }
    );
  }

  return {
    checked: candidates.length,
    deleted: orphans.map((orphan) => orphan.pathname),
  };
}
