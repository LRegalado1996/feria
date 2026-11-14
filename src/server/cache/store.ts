import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { storeSlugSchema } from "@/lib/schemas/store";
import { db } from "@/server/db";
import { findActiveStoreBySlug } from "@/server/services/store";

/** Every cached read of one store, whatever slug it was read under. */
function storeTag(id: number): string {
  return `store:${id}`;
}

/**
 * Every cached answer for one address, "no such store" included: it has no
 * store id to be tagged with, and it must go the moment a store takes the
 * address or is activated under it.
 */
function storeSlugTag(slug: string): string {
  return `store-slug:${slug}`;
}

/**
 * The active store at `slug`, or `null`, cached across requests: every public
 * page of a store reads it, and it changes only when someone edits the store.
 * It reads through the service with the app's own client, not through the
 * oRPC `caller`: that one builds its context from `headers()`, which a cached
 * function may not read.
 */
async function readActiveStore(slug: string) {
  "use cache";
  // A safety net only: an edit invalidates the entry at once (below).
  cacheLife("hours");
  cacheTag(storeSlugTag(slug));

  const found = await findActiveStoreBySlug(db, slug);

  if (found) {
    cacheTag(storeTag(found.id));
  }

  return found;
}

/**
 * The store a public URL's first segment names, or `null` for a 404. A
 * segment is any string: one that could never be a slug (reserved, malformed,
 * too long) is answered here, so it costs neither a query nor a cache entry.
 */
export async function getStoreForPath(segment: string) {
  const slug = storeSlugSchema.safeParse(segment);

  return slug.success ? await readActiveStore(slug.data) : null;
}

/**
 * Drops what is cached about a store after it was created or edited. Both
 * tags: the id reaches the entry under a slug the store just left, the slug
 * reaches a cached "no such store" at the address it now holds. `expire: 0`
 * serves nothing stale: the next visit reads the database.
 */
export function invalidateStoreCache({
  id,
  slug,
}: {
  id: number;
  slug: string;
}): void {
  revalidateTag(storeTag(id), { expire: 0 });
  revalidateTag(storeSlugTag(slug), { expire: 0 });
}
