import { connection } from "next/server";

import type { StoreAnnouncement } from "@/app/_components/organisms/store-frame";
import type { StoreHeaderProps } from "@/app/_components/organisms/store-header";
import {
  headerCategories,
  type NavigationCategory,
} from "@/lib/catalog/navigation";
import { homeHref } from "@/lib/home/content";
import type { Locale } from "@/lib/i18n/config";
import { readCategories } from "@/server/cache/catalog";
import { readAnnouncement } from "@/server/cache/home";
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
        href: shown.href === null ? null : homeHref(shown.href, locale),
        lang: shown.lang,
        short: shown.shortText,
        text: shown.text,
      }
    : null;
}

/** A category with the admin's choice of whether the header lists it. */
type HeaderCategory = NavigationCategory & { showInHeader: boolean };

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

  return store ? headerCategories(await readCategories(store, locale)) : [];
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
 * (`headerCategories`, FER-051).
 */
export async function shellOf(
  store: PublicStore,
  locale: Locale,
  categories?: readonly HeaderCategory[]
): Promise<StoreShell> {
  const announcement = await announcementOf(store, locale);

  return {
    announcement: Promise.resolve(announcement),
    categories: headerCategories(
      categories ?? (await readCategories(store, locale))
    ),
  };
}
