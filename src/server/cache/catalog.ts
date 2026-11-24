import { ORPCError } from "@orpc/server";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import type { Locale } from "@/lib/i18n/config";
import { catalogSlugSchema } from "@/lib/schemas/catalog";
import type { Currency } from "@/lib/utils/format";
import { db } from "@/server/db";
import {
  countPublishedByCategory,
  getAllArticlesCover,
  getCategoryPage,
  getPublishedProduct,
  listShownCategories,
  listCategoryArticles,
  listRelatedPool,
} from "@/server/services/catalog";

/**
 * Every cached read of one store's published articles, and the home's
 * (FER-020), which shows them.
 */
export function catalogTag(storeId: number): string {
  return `catalog:${storeId}`;
}

/**
 * A store's published article at `slug` in `locale`, or `null`, cached
 * across requests (FER-024): the article page is static output, so its
 * read is cached and every write that changes what it shows drops it
 * (`invalidateCatalogCache`). A draft or a missing article is `null`, never
 * an error, so the page answers a real 404. An address that can never be an
 * article's (malformed or too long) is answered here, before the cache, so a
 * stream of made-up addresses costs neither a query nor a cache entry.
 */
export async function readPublishedArticle(
  store: { currencyCode: Currency; id: number },
  slug: string,
  locale: Locale
) {
  const parsed = catalogSlugSchema.safeParse(slug);

  // The schema trims, an address does not: " cadena " is not "cadena".
  if (!parsed.success || parsed.data !== slug) {
    return null;
  }

  return await readCachedArticle(store, slug, locale);
}

async function readCachedArticle(
  store: { currencyCode: Currency; id: number },
  slug: string,
  locale: Locale
) {
  "use cache";
  // A safety net only: a write invalidates the entry at once.
  cacheLife("hours");
  cacheTag(catalogTag(store.id));

  try {
    return await getPublishedProduct(db, {
      currencyCode: store.currencyCode,
      locale,
      slug,
      storeId: store.id,
    });
  } catch (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") {
      return null;
    }

    throw error;
  }
}

/**
 * What the suggestions under an article are picked from (its category, and
 * the rest of the store when the category is small), cached with the
 * store's catalog. The browser draws from it per visit (FER-039).
 */
export async function readRelatedArticles(
  store: { currencyCode: Currency; id: number },
  article: { categoryId: number | null; id: number },
  locale: Locale
) {
  "use cache";
  cacheLife("hours");
  cacheTag(catalogTag(store.id));

  return await listRelatedPool(db, {
    categoryId: article.categoryId,
    currencyCode: store.currencyCode,
    locale,
    productId: article.id,
    storeId: store.id,
  });
}

/**
 * How many published articles each category holds, cached with the
 * catalog: what the order page's row draws its category from (FER-051).
 */
export async function readCategoryCounts(store: { id: number }) {
  "use cache";
  cacheLife("hours");
  cacheTag(catalogTag(store.id));

  return await countPublishedByCategory(db, { storeId: store.id });
}

/**
 * A category's newest published articles in `locale`, cached with the
 * catalog: the order page's row once its category is drawn (FER-051).
 */
export async function readCategoryArticles(
  store: { currencyCode: Currency; id: number },
  categoryId: number,
  locale: Locale
) {
  "use cache";
  cacheLife("hours");
  cacheTag(catalogTag(store.id));

  return await listCategoryArticles(db, {
    categoryId,
    currencyCode: store.currencyCode,
    locale,
    storeId: store.id,
  });
}

/**
 * The categories the storefront lists (those with a published article,
 * FER-079), in their order, named in `locale`, cached with its catalog
 * (FER-039): the header and the footer of every store page list them, an
 * article's static page included, so adding, renaming, reordering or
 * deleting one drops the tag, and so does publishing a category's first
 * article or unpublishing its last (every article write that reaches the
 * storefront drops it).
 */
export async function readCategories(store: { id: number }, locale: Locale) {
  "use cache";
  cacheLife("hours");
  cacheTag(catalogTag(store.id));

  return await listShownCategories(db, { locale, storeId: store.id });
}

/**
 * A category's page (FER-043) at `slug` in `locale`: its names, its group,
 * its categories, its texts and its cover, or `null`. Cached with the
 * catalog, so every category write drops it. An address that can never be
 * a category's is answered before the cache, like an article's.
 */
export async function readCategoryPage(
  store: { id: number },
  slug: string,
  locale: Locale
) {
  const parsed = catalogSlugSchema.safeParse(slug);

  if (!parsed.success || parsed.data !== slug) {
    return null;
  }

  return await readCachedCategoryPage(store, slug, locale);
}

async function readCachedCategoryPage(
  store: { id: number },
  slug: string,
  locale: Locale
) {
  "use cache";
  cacheLife("hours");
  cacheTag(catalogTag(store.id));

  return await getCategoryPage(db, { locale, slug, storeId: store.id });
}

/**
 * The cover of the page of all the store's articles (FER-043), cached with
 * the catalog; a store edit drops the tag too (`invalidateCatalogCache`).
 */
export async function readAllArticlesCover(
  store: { id: number },
  locale: Locale,
  fallbackAlt: string
) {
  "use cache";
  cacheLife("hours");
  cacheTag(catalogTag(store.id));

  return await getAllArticlesCover(db, {
    fallbackAlt,
    locale,
    storeId: store.id,
  });
}

/**
 * Drops what is cached about a store's articles after a write that changes
 * what a visitor sees: an article's texts, price, photos, availability or
 * publication, a category (its name, its place, a new or a deleted one), the
 * store's texts (the all-articles cover's alt text). `expire: 0` serves
 * nothing stale.
 */
export function invalidateCatalogCache(storeId: number): void {
  revalidateTag(catalogTag(storeId), { expire: 0 });
}
