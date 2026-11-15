import { ORPCError } from "@orpc/server";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import type { Locale } from "@/lib/i18n/config";
import {
  catalogSlugSchema,
  RELATED_PRODUCTS_DEFAULT,
} from "@/lib/schemas/catalog";
import type { Currency } from "@/lib/utils/format";
import { db } from "@/server/db";
import {
  getPublishedProduct,
  listRelatedProducts,
} from "@/server/services/catalog";

/** Every cached read of one store's published articles. */
function catalogTag(storeId: number): string {
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
  if (!catalogSlugSchema.safeParse(slug).success) {
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

/** The articles shown beside one, cached with the store's catalog. */
export async function readRelatedArticles(
  store: { currencyCode: Currency; id: number },
  article: { categoryId: number | null; id: number },
  locale: Locale
) {
  "use cache";
  cacheLife("hours");
  cacheTag(catalogTag(store.id));

  return await listRelatedProducts(db, {
    categoryId: article.categoryId,
    currencyCode: store.currencyCode,
    limit: RELATED_PRODUCTS_DEFAULT,
    locale,
    productId: article.id,
    storeId: store.id,
  });
}

/**
 * Drops what is cached about a store's articles after a write that changes
 * what a visitor sees: an article's texts, price, photos, availability or
 * publication, a category's name, the store's currency. `expire: 0` serves
 * nothing stale.
 */
export function invalidateCatalogCache(storeId: number): void {
  revalidateTag(catalogTag(storeId), { expire: 0 });
}
