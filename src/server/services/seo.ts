import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import type { DatabaseClient } from "@/server/db";
import {
  category,
  categoryTranslation,
  product,
  productTranslation,
  store,
} from "@/server/db/schema";

interface StoreScope {
  storeId: number;
}

/**
 * What search engines and AI assistants are told about (FER-024): the
 * sitemap and each store's `llms.txt`. The rule every read here keeps: a
 * draft or anything of an inactive store is never listed.
 */

/** The active stores, oldest first, with their texts in every language. */
export async function listIndexableStores(db: DatabaseClient) {
  return await db.query.store.findMany({
    columns: {
      currencyCode: true,
      id: true,
      name: true,
      slug: true,
      updatedAt: true,
    },
    orderBy: [asc(store.id)],
    where: eq(store.isActive, true),
    with: {
      translations: {
        columns: { description: true, locale: true, tagline: true },
      },
    },
  });
}

export type IndexableStore = Awaited<
  ReturnType<typeof listIndexableStores>
>[number];

/**
 * A store's published articles, newest first, with their titles in every
 * language: none of an inactive store, even when asked by its id. Core
 * selects, not the relational API: that one would rewrite a column of
 * another table inside a condition to its own (`"product"."isActive"`).
 */
export async function listIndexableArticles(
  db: DatabaseClient,
  { storeId }: StoreScope
) {
  const rows = await db
    .select({
      id: product.id,
      priceAmount: product.priceAmount,
      publishedAt: product.publishedAt,
      slug: product.slug,
      updatedAt: product.updatedAt,
    })
    .from(product)
    .innerJoin(store, eq(store.id, product.storeId))
    .where(
      and(
        eq(product.storeId, storeId),
        eq(product.status, "published"),
        eq(store.isActive, true)
      )
    )
    .orderBy(desc(product.publishedAt), desc(product.id));

  if (rows.length === 0) {
    return [];
  }

  const titles = await db
    .select({
      locale: productTranslation.locale,
      productId: productTranslation.productId,
      title: productTranslation.title,
    })
    .from(productTranslation)
    .where(
      inArray(
        productTranslation.productId,
        rows.map((row) => row.id)
      )
    );

  return rows.map((row) => ({
    ...row,
    titles: titles.flatMap(({ productId, ...title }) =>
      productId === row.id ? [title] : []
    ),
  }));
}

export type IndexableArticle = Awaited<
  ReturnType<typeof listIndexableArticles>
>[number];

/**
 * A store's categories in their order, named in `locale` (else the language
 * they have), only those with a published article: a link to an empty
 * listing tells an assistant nothing.
 */
export async function listIndexableCategories(
  db: DatabaseClient,
  { locale, storeId }: StoreScope & { locale: Locale }
) {
  const rows = await db
    .select({ id: category.id, slug: category.slug })
    .from(category)
    .innerJoin(store, eq(store.id, category.storeId))
    .where(
      and(
        eq(category.storeId, storeId),
        eq(store.isActive, true),
        sql`exists (select 1 from ${product} where ${and(
          eq(product.categoryId, category.id),
          eq(product.storeId, category.storeId),
          eq(product.status, "published")
        )})`
      )
    )
    .orderBy(asc(category.position), asc(category.id));

  if (rows.length === 0) {
    return [];
  }

  const names = await db
    .select({
      categoryId: categoryTranslation.categoryId,
      locale: categoryTranslation.locale,
      name: categoryTranslation.name,
    })
    .from(categoryTranslation)
    .where(
      inArray(
        categoryTranslation.categoryId,
        rows.map((row) => row.id)
      )
    );

  return rows.map(({ id, slug }) => ({
    name:
      pickTranslation(
        names.filter((name) => name.categoryId === id),
        locale
      )?.name ?? slug,
    slug,
  }));
}
