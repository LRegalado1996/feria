import { connection } from "next/server";

import type { StoreAnnouncement } from "@/app/_components/organisms/store-frame";
import type { StoreHeaderProps } from "@/app/_components/organisms/store-header";
import {
  headerCategories,
  type NavigationCategory,
} from "@/lib/catalog/navigation";
import type { Locale } from "@/lib/i18n/config";
import { pageHref } from "@/lib/page/content";
import { readCategories } from "@/server/cache/catalog";
import { readAnnouncement, readHeaderPages } from "@/server/cache/page";
import { readStore } from "@/server/cache/store";
import type { PublicStore } from "@/server/services/store";

/** What the frame of a page shows from the store (`organisms/store-frame`). */
export interface StoreShell {
  announcement: Promise<StoreAnnouncement | null>;
  categories: StoreHeaderProps["categories"];
}

/**
 * The bar's words in the page's language (FER-020): the store's
 * announcement while it is on and inside its days, with its shorter line
 * for a phone and its link in the page's language; `null` when there is
 * none, and the page then has no bar.
 */
export async function announcementOf(
  store: Pick<PublicStore, "id">,
  locale: Locale
): Promise<StoreAnnouncement | null> {
  const shown = await readAnnouncement(store, locale);

  return shown
    ? {
        href: shown.href === null ? null : pageHref(shown.href, locale),
        lang: shown.lang,
        short: shown.shortText,
        text: shown.text,
      }
    : null;
}

/** A category with the admin's choice of whether the header lists it. */
type HeaderCategory = NavigationCategory & { showInHeader: boolean };

/**
 * The header's entries: the published pages the admin shows there
 * (FER-060), each a link to its address like a category in no group, then
 * the categories it shows there (FER-051). Pages go first because the
 * computer's line holds only what fits and has no menu: a category left off
 * it is still in the catalog's filter, a page would be nowhere. A page's id
 * is negated, so it never meets a category's in the header's keys.
 */
async function headerEntries(
  store: Pick<PublicStore, "id">,
  locale: Locale,
  categories: readonly HeaderCategory[]
): Promise<HeaderCategory[]> {
  const pages = await readHeaderPages(store, locale);

  return [
    ...pages.map((entry) => ({
      id: -entry.id,
      lang: entry.lang,
      name: entry.name,
      parentId: null,
      path: entry.path,
      showInHeader: true,
      slug: entry.slug,
    })),
    ...headerCategories(categories),
  ];
}

/** The store, once a request is there: the build has no database. */
async function readStoreAtRequest() {
  await connection();

  return await readStore();
}

/** The header's categories, from the store once it is read. */
async function categoriesAtRequest(
  read: Promise<PublicStore | null>,
  locale: Locale
) {
  const store = await read;

  return store
    ? await headerEntries(store, locale, await readCategories(store, locale))
    : [];
}

/** The bar's words, from the store once it is read. */
async function announcementAtRequest(
  read: Promise<PublicStore | null>,
  locale: Locale
) {
  const store = await read;

  return store ? await announcementOf(store, locale) : null;
}

/**
 * The frame of a page read per request (the catalog, the cart): promises,
 * which the frame resolves behind boundaries of its own, so the header stays
 * in the page's static shell, and the bar's words and the categories stream
 * in after it.
 */
export function streamedShell(locale: Locale): StoreShell {
  const read = readStoreAtRequest();

  return {
    announcement: announcementAtRequest(read, locale),
    categories: categoriesAtRequest(read, locale),
  };
}

/**
 * The frame of a page that already read the store: an article, whose static
 * page reads only cached data, and the home, an order and a catalog page,
 * which wait for their reads before anything is sent. The bar's words and
 * the categories are read here, before the page renders, so the header's
 * links sit behind no boundary and are in the first response, for a crawler
 * that runs no script (FER-043). A page that read the categories itself, as
 * of now (a catalog page), hands them over instead of the cached list.
 * Either way the header gets only those the admin shows there
 * (`headerCategories`, FER-051), then the pages it shows there (FER-060).
 */
export async function shellOf(
  store: PublicStore,
  locale: Locale,
  categories?: readonly HeaderCategory[]
): Promise<StoreShell> {
  const announcement = await announcementOf(store, locale);

  return {
    announcement: Promise.resolve(announcement),
    categories: await headerEntries(
      store,
      locale,
      categories ?? (await readCategories(store, locale))
    ),
  };
}
