import { connection } from "next/server";

import type { StoreAnnouncement } from "@/app/_components/organisms/store-frame";
import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { readCategories } from "@/server/cache/catalog";
import { readStore } from "@/server/cache/store";
import type { PublicStore } from "@/server/services/store";

/** What the frame of a page shows from the store (`organisms/store-frame`). */
export interface StoreShell {
  announcement: Promise<StoreAnnouncement | null>;
  categories: Promise<readonly { lang: string; name: string; slug: string }[]>;
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
 * The frame of a page read per request (the home, the catalog, the cart):
 * promises, which the frame resolves behind boundaries of its own, so the
 * header stays in the page's static shell and the bar and the categories
 * stream in after it. One read of the store feeds both.
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
 * page reads only cached data, and an order, which waits for its read.
 */
export function shellOf(store: PublicStore, locale: Locale): StoreShell {
  return {
    announcement: Promise.resolve(announcementOf(store, locale)),
    categories: readCategories(store, locale),
  };
}
