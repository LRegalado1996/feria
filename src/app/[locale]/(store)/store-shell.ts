import { connection } from "next/server";

import type { StoreAnnouncement } from "@/app/_components/organisms/store-frame";
import type { StoreHeaderProps } from "@/app/_components/organisms/store-header";
import type { NavigationCategory } from "@/lib/catalog/navigation";
import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { readCategories } from "@/server/cache/catalog";
import { readStore } from "@/server/cache/store";
import type { PublicStore } from "@/server/services/store";

/** What the frame of a page shows from the store (`organisms/store-frame`). */
export interface StoreShell {
  announcement: Promise<StoreAnnouncement | null>;
  categories: StoreHeaderProps["categories"];
}

/**
 * The bar's words in the page's language (FER-039): until the store has
 * announcements of its own (FER-020), its tagline; nothing without one.
 */
export function announcementOf(
  store: PublicStore,
  locale: Locale
): StoreAnnouncement | null {
  const text = pickTranslation(store.translations, locale);

  return text && text.tagline.trim() !== ""
    ? { lang: text.locale, text: text.tagline }
    : null;
}

/** The store, once a request is there: the build has no database. */
async function readStoreAtRequest() {
  await connection();

  return await readStore();
}

/** The bar's words, from the store once it is read. */
async function announcementAtRequest(
  read: Promise<PublicStore | null>,
  locale: Locale
) {
  const store = await read;

  return store ? announcementOf(store, locale) : null;
}

/** The header's categories, from the store once it is read. */
async function categoriesAtRequest(
  read: Promise<PublicStore | null>,
  locale: Locale
) {
  const store = await read;

  return store ? await readCategories(store, locale) : [];
}

/**
 * The frame of a page read per request (the catalog, the cart): promises,
 * which the frame resolves behind boundaries of its own, so the header stays
 * in the page's static shell and the bar and the categories stream in after
 * it. One read of the store feeds both.
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
 * which wait for their reads before anything is sent. The categories are
 * read here, before the page renders, so the header's links sit behind no
 * boundary and are in the first response, for a crawler that runs no
 * script (FER-043). A page that read them itself, as of now (a catalog
 * page), hands them over instead of the cached list.
 */
export async function shellOf(
  store: PublicStore,
  locale: Locale,
  categories?: readonly NavigationCategory[]
): Promise<StoreShell> {
  return {
    announcement: Promise.resolve(announcementOf(store, locale)),
    categories: categories ?? (await readCategories(store, locale)),
  };
}
