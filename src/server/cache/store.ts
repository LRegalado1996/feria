import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { db } from "@/server/db";
import { findStore } from "@/server/services/store";

/** Every cached read of the store's own row. */
const STORE_TAG = "store";

/**
 * The store (FER-038), or `null` before its row exists, cached across
 * requests: every public page reads it, and it changes only when an admin
 * edits it. It reads through the service with the app's own client, not
 * through the oRPC `caller`: that one builds its context from `headers()`,
 * which a cached function may not read.
 */
export async function readStore() {
  "use cache";
  // A safety net only: an edit invalidates the entry at once (below).
  cacheLife("hours");
  cacheTag(STORE_TAG);

  return await findStore(db);
}

/**
 * Drops the cached store after an edit. `expire: 0` serves nothing stale: the
 * next visit reads the database.
 */
export function invalidateStoreCache(): void {
  revalidateTag(STORE_TAG, { expire: 0 });
}
