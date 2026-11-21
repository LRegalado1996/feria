import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { db } from "@/server/db";
import { findComingSoon } from "@/server/services/coming-soon";

/** Every cached read of the coming-soon page (FER-034). */
const COMING_SOON_TAG = "coming-soon";

/**
 * The coming-soon page as its route and the sitemap read it: the switch, the
 * countdown's day and the texts, cached across requests. An admin's save
 * invalidates it (below). The proxy cannot read it: Next runs no
 * `"use cache"` there (`./storefront-switch.ts` has the proxy's own read).
 */
export async function readComingSoon() {
  "use cache";
  // A safety net only: a save invalidates the entry at once.
  cacheLife("hours");
  cacheTag(COMING_SOON_TAG);

  return await findComingSoon(db);
}

/**
 * Drops the cached page after a save or a flip of the switch. `expire: 0`
 * serves nothing stale: the next visit reads the database.
 */
export function invalidateComingSoonCache(): void {
  revalidateTag(COMING_SOON_TAG, { expire: 0 });
}
