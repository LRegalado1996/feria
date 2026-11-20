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
  findHomePageId,
  findShowingAnnouncement,
  getPageContent,
} from "@/server/services/page";

/**
 * Every cached read of what a store's pages show (FER-058): its banners,
 * curated lists and, through each page's read, the categories' rows. A
 * write to store-level content any page may show drops it.
 */
export function pagesTag(storeId: number): string {
  return `pages:${storeId}`;
}

/** The cached read of one page: its cover and sequence (FER-058). */
export function pageTag(storeId: number, pageId: number): string {
  return `page:${storeId}:${pageId}`;
}

/** The cached choice of the store's home page (FER-058). */
export function homePageTag(storeId: number): string {
  return `home-page:${storeId}`;
}

/** The cached announcement every store page's frame shows (FER-020). */
export function announcementTag(storeId: number): string {
  return `announcement:${storeId}`;
}

/**
 * The lifetime of a read made at `now`: fresh for an hour at most, and
 * never past the next midnight in the store's time zone, when a banner or
 * an announcement may start or end its days (FER-020). Going stale is not
 * expiring: the first request after midnight is still answered from the
 * stale entry while it regenerates, so one visitor may see yesterday's
 * banner or announcement; the next one gets today's, without anyone
 * touching the admin. `expire` stays a day on purpose: clamping it to
 * midnight too would turn the read into a dynamic hole in the last minutes
 * before midnight (an accepted decision, FER-020).
 */
function dayLife(now: Date) {
  return {
    expire: 86_400,
    revalidate: Math.min(3600, secondsUntilNextBusinessDay(now)),
  };
}

/**
 * The announcement the storefront's bar shows now in `locale`, or `null`,
 * cached across requests: every store page's frame shows it, an article's
 * static page included. Dropped by its own write
 * (`invalidateAnnouncementCache`) and refreshed at the next business day.
 */
export async function readAnnouncement(store: { id: number }, locale: Locale) {
  "use cache";
  const now = new Date();
  cacheLife(dayLife(now));
  cacheTag(announcementTag(store.id));

  return await findShowingAnnouncement(db, {
    locale,
    storeId: store.id,
    today: businessDay(now),
  });
}

/**
 * The page the store shows at `/` (FER-058), cached across requests: the
 * home reads it on every visit, and it changes only when an admin chooses
 * another home, which drops it.
 */
export async function readHomePageId(store: { id: number }) {
  "use cache";
  // A safety net only: choosing another home drops the entry at once.
  cacheLife("hours");
  cacheTag(homePageTag(store.id));

  return await findHomePageId(db, { storeId: store.id });
}

/**
 * What the store's page `pageId` shows now in `locale` (FER-058;
 * `PageContent` says what it holds), cached across requests. Tagged with
 * the page itself (its order and cover), with the store's pages (a banner
 * or a curated list, which any page may show) and with the catalog, so
 * every write a shopper would see of an article or a category
 * (`invalidateCatalogCache`: a publication, a sold out, a price, a renamed
 * or deleted category) drops it; refreshed at the next business day for
 * the banners' days. The home is the store's `homePageId`.
 */
export async function readPageContent(
  store: { currencyCode: Currency; id: number },
  pageId: number,
  locale: Locale
) {
  "use cache";
  const now = new Date();
  cacheLife(dayLife(now));
  cacheTag(pageTag(store.id, pageId), pagesTag(store.id), catalogTag(store.id));

  return await getPageContent(db, {
    currencyCode: store.currencyCode,
    locale,
    pageId,
    storeId: store.id,
    today: businessDay(now),
  });
}

/**
 * Drops every cached page of a store after a write to what any of them
 * may show (a banner, a curated list). `expire: 0` serves nothing stale.
 */
export function invalidatePagesCache(storeId: number): void {
  revalidateTag(pagesTag(storeId), { expire: 0 });
}

/** Drops one page's cached read after a write to its order or cover. */
export function invalidatePageCache(storeId: number, pageId: number): void {
  revalidateTag(pageTag(storeId, pageId), { expire: 0 });
}

/** Drops the cached announcement after it is saved. */
export function invalidateAnnouncementCache(storeId: number): void {
  revalidateTag(announcementTag(storeId), { expire: 0 });
}
