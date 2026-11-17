import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import type { DatabaseClient } from "@/server/db";
import {
  category,
  categoryTranslation,
  product,
  productTranslation,
} from "@/server/db/schema";

interface StoreScope {
  storeId: number;
}

/**
 * What search engines and AI assistants are told about (FER-024): the
 * sitemap and `llms.txt`. The rule every read here keeps: a draft is never
 * listed.
 */

/**
 * The store (FER-038: the table's one row) with its texts in every language,
 * or `null` before that row exists.
 */
export async function findIndexableStore(db: DatabaseClient) {
  const found = await db.query.store.findFirst({
    columns: {
      currencyCode: true,
      id: true,
      name: true,
      updatedAt: true,
    },
    with: {
      translations: {
        columns: { description: true, locale: true, tagline: true },
      },
    },
  });

  return found ?? null;
}

export type IndexableStore = NonNullable<
  Awaited<ReturnType<typeof findIndexableStore>>
>;

/**
 * The store's published articles, newest first, with their titles in every
 * language.
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
    .where(and(eq(product.storeId, storeId), eq(product.status, "published")))
    .orderBy(desc(product.publishedAt), desc(product.id));

  if (rows.length === 0) {
    return [];
  }

  // Published again here, not only in the list's query: under READ
  // COMMITTED an article unpublished between the two statements would
  // otherwise come back with whatever it was edited into.
  const titles = await db
    .select({
      locale: productTranslation.locale,
      productId: productTranslation.productId,
      title: productTranslation.title,
    })
    .from(productTranslation)
    .innerJoin(product, eq(product.id, productTranslation.productId))
    .where(
      and(
        inArray(
          productTranslation.productId,
          rows.map((row) => row.id)
        ),
        eq(product.status, "published")
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
    .where(
      and(
        eq(category.storeId, storeId),
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
