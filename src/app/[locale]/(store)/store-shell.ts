import { connection } from "next/server";

import type { StoreAnnouncement } from "@/app/_components/organisms/store-frame";
import { getDictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { readCategories } from "@/server/cache/catalog";
import { readStore } from "@/server/cache/store";
import type { PublicStore } from "@/server/services/store";

/** What the frame of a page shows from the store (`organisms/store-frame`). */
export interface StoreShell {
  announcement: Promise<StoreAnnouncement | null>;
  categories: Promise<readonly { lang: string; name: string; slug: string }[]>;
}

/**
 * The bar's words in the page's language (FER-039): until the store writes
 * its own announcements (FER-020), a fixed one from the dictionaries, the
 * fair and the stall, with a shorter version for a phone.
 */
export function announcementOf(locale: Locale): StoreAnnouncement {
  const { full, short } = getDictionary(locale).storefront.shell.announcement;

  return { lang: locale, short, text: full };
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

  return store ? await readCategories(store, locale) : [];
}

/**
 * The frame of a page read per request (the catalog, the cart): promises,
 * which the frame resolves behind boundaries of its own, so the header stays
 * in the page's static shell and the categories stream in after it. The
 * bar's words are fixed until FER-020, so they need no read.
 */
export function streamedShell(locale: Locale): StoreShell {
  const read = readStoreAtRequest();

  return {
    announcement: Promise.resolve(announcementOf(locale)),
    categories: categoriesAtRequest(read, locale),
  };
}

/**
 * The frame of a page that already read the store: an article, whose static
 * page reads only cached data, and the home and an order, which wait for
 * their reads before anything is sent.
 */
export function shellOf(store: PublicStore, locale: Locale): StoreShell {
  return {
    announcement: Promise.resolve(announcementOf(locale)),
    categories: readCategories(store, locale),
  };
}
