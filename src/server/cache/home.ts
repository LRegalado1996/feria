import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import type { Locale } from "@/lib/i18n/config";
import {
  businessDay,
  type Currency,
  secondsUntilNextBusinessDay,
} from "@/lib/utils/format";
import { catalogTag } from "@/server/cache/catalog";
import { db } from "@/server/db";
import {
  findShowingAnnouncement,
  getHomeContent,
} from "@/server/services/home";

/** Every cached read of one store's home curation (FER-020). */
export function homeTag(storeId: number): string {
  return `home:${storeId}`;
}

/**
 * The lifetime of a home read made at `now`: an hour at most, and never
 * past the next midnight in the store's time zone, when a banner or an
 * announcement may start or end its days. A read made at 23:59 is
 * refreshed a minute later, so what ended yesterday leaves the storefront
 * without anyone touching it (FER-020). The entry expires within a day
 * whatever the traffic.
 */
function homeLife(now: Date) {
  return {
    expire: 86_400,
    revalidate: Math.min(3600, secondsUntilNextBusinessDay(now)),
  };
}

/**
 * The announcement the storefront's bar shows now in `locale`, or `null`,
 * cached across requests: every store page's frame shows it, an article's
 * static page included. Dropped by every curation write
 * (`invalidateHomeCache`) and refreshed at the next business day.
 */
export async function readAnnouncement(store: { id: number }, locale: Locale) {
  "use cache";
  const now = new Date();
  cacheLife(homeLife(now));
  cacheTag(homeTag(store.id));

  return await findShowingAnnouncement(db, {
    locale,
    storeId: store.id,
    today: businessDay(now),
  });
}

/**
 * What the home shows now in `locale` (FER-020; `HomeContent` says what it
 * holds), cached across requests. Tagged with the home and with the
 * catalog, so a curation write and every write a shopper would see of an
 * article or a category (`invalidateCatalogCache`: a publication, a sold
 * out, a price, a renamed or deleted category) drop it; refreshed at the
 * next business day for the days of the banners and the announcement.
 */
export async function readHomeContent(
  store: { currencyCode: Currency; id: number },
  locale: Locale
) {
  "use cache";
  const now = new Date();
  cacheLife(homeLife(now));
  cacheTag(homeTag(store.id), catalogTag(store.id));

  return await getHomeContent(db, {
    currencyCode: store.currencyCode,
    locale,
    storeId: store.id,
    today: businessDay(now),
  });
}

/**
 * Drops what is cached about a store's home after a curation write.
 * `expire: 0` serves nothing stale.
 */
export function invalidateHomeCache(storeId: number): void {
  revalidateTag(homeTag(storeId), { expire: 0 });
}
