import { ORPCError } from "@orpc/server";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import type {
  CreateProductValues,
  ListProductsValues,
  ProductCursor,
  UpdateProductValues,
} from "@/lib/schemas/catalog";
import type { Currency } from "@/lib/utils/format";
import { firstFreeSlug, slugify } from "@/lib/utils/slugify";
import type { DatabaseClient } from "@/server/db";
import {
  category,
  product,
  productImage,
  productTranslation,
} from "@/server/db/schema";

/** What names an article whose title has nothing readable in it. */
const PRODUCT_SLUG_FALLBACK = "articulo";

/** The store a catalog read or write is about, already resolved and trusted. */
interface StoreScope {
  storeId: number;
}

// ── Public reads ─────────────────────────────────────────────────────────

/**
 * A store's categories in their order, each with its name in `locale` (or
 * the language it has) and the language it came in, for `lang`.
 */
export async function listCategories(
  db: DatabaseClient,
  { locale, storeId }: StoreScope & { locale: Locale }
) {
  const rows = await db.query.category.findMany({
    columns: { id: true, position: true, slug: true },
    orderBy: [asc(category.position), asc(category.id)],
    where: eq(category.storeId, storeId),
    with: {
      translations: { columns: { locale: true, name: true } },
    },
  });

  return rows.map(({ translations, ...row }) => {
    const name = pickTranslation(translations, locale);

    return { ...row, lang: name?.locale ?? locale, name: name?.name ?? "" };
  });
}

/** `%`, `_` and the escape itself, taken literally inside an ILIKE. */
function likePattern(search: string): string {
  return `%${search.replaceAll(/[\\%_]/gu, (char) => `\\${char}`)}%`;
}

/**
 * Whether the article's text in `locale` (or its Spanish text, when it has
 * none in `locale`: what the visitor is shown) holds `search` in its title or
 * description, case- and accent-blind on the case only.
 */
function matchesSearch(search: string, locale: Locale): SQL {
  const shown = alias(productTranslation, "shown");
  const own = alias(productTranslation, "own");
  const pattern = likePattern(search);
  // An alias renders as its name only, so each FROM spells out its table.
  const fromShown = sql`${productTranslation} as ${sql.identifier("shown")}`;
  const fromOwn = sql`${productTranslation} as ${sql.identifier("own")}`;

  return sql`exists (select 1 from ${fromShown} where ${and(
    eq(shown.productId, product.id),
    or(
      eq(shown.locale, locale),
      and(
        eq(shown.locale, "es"),
        sql`not exists (select 1 from ${fromOwn} where ${and(eq(own.productId, product.id), eq(own.locale, locale))})`
      )
    ),
    or(ilike(shown.title, pattern), ilike(shown.description, pattern))
  )})`;
}

/** Rows strictly after the cursor in the newest-first order. */
function afterCursor(cursor: ProductCursor): SQL {
  return sql`(${product.publishedAt}, ${product.id}) < (${cursor.publishedAt}::timestamptz, ${cursor.id}::int)`;
}

/**
 * The cards of these articles, in the order given: title and alt text in
 * `locale` (or the language they have), the cover (first image by position)
 * and the price with the store's currency.
 */
async function loadCards(
  db: DatabaseClient,
  {
    currencyCode,
    ids,
    locale,
  }: { currencyCode: Currency; ids: number[]; locale: Locale }
) {
  if (ids.length === 0) {
    return [];
  }

  const rows = await db.query.product.findMany({
    columns: {
      id: true,
      isAvailable: true,
      priceAmount: true,
      publishedAt: true,
      slug: true,
    },
    where: inArray(product.id, ids),
    with: {
      category: { columns: { slug: true } },
      images: {
        columns: { height: true, id: true, url: true, width: true },
        limit: 1,
        orderBy: [asc(productImage.position), asc(productImage.id)],
        with: { translations: { columns: { altText: true, locale: true } } },
      },
      translations: { columns: { locale: true, title: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  return ids.flatMap((id) => {
    const row = byId.get(id);

    if (!row) {
      return [];
    }

    const title = pickTranslation(row.translations, locale);
    const [cover] = row.images;
    const alt = cover ? pickTranslation(cover.translations, locale) : null;

    return [
      {
        categorySlug: row.category?.slug ?? null,
        cover: cover
          ? {
              alt: alt?.altText ?? title?.title ?? "",
              height: cover.height,
              url: cover.url,
              width: cover.width,
            }
          : null,
        currencyCode,
        id: row.id,
        isAvailable: row.isAvailable,
        lang: title?.locale ?? locale,
        priceAmount: row.priceAmount ?? 0,
        slug: row.slug,
        title: title?.title ?? "",
      },
    ];
  });
}

export type ProductCard = Awaited<ReturnType<typeof loadCards>>[number];

/**
 * One page of a store's published articles, newest first, narrowed by
 * category and search. Keyset pagination on (`publishedAt`, `id`): a row
 * inserted while the visitor scrolls never shifts the next page.
 */
export async function listPublishedProducts(
  db: DatabaseClient,
  {
    category: categorySlug,
    currencyCode,
    cursor,
    limit,
    locale,
    q,
    storeId,
  }: StoreScope &
    Omit<ListProductsValues, "storeSlug"> & { currencyCode: Currency }
) {
  const page = await db
    .select({ id: product.id, publishedAt: product.publishedAt })
    .from(product)
    .leftJoin(
      category,
      and(eq(category.id, product.categoryId), eq(category.storeId, storeId))
    )
    .where(
      and(
        eq(product.storeId, storeId),
        eq(product.status, "published"),
        categorySlug === undefined
          ? undefined
          : eq(category.slug, categorySlug),
        q === undefined ? undefined : matchesSearch(q, locale),
        cursor === undefined ? undefined : afterCursor(cursor)
      )
    )
    .orderBy(desc(product.publishedAt), desc(product.id))
    // One row past the page tells whether another page follows.
    .limit(limit + 1);

  const rows = page.slice(0, limit);
  const last = rows.at(-1);
  const items = await loadCards(db, {
    currencyCode,
    ids: rows.map((row) => row.id),
    locale,
  });

  return {
    items,
    nextCursor:
      page.length > limit && last?.publishedAt
        ? { id: last.id, publishedAt: last.publishedAt.toISOString() }
        : null,
  };
}

/**
 * One published article of the store by its slug, with every image in order
 * and the texts in `locale` (or Spanish), or NOT_FOUND: a draft and another
 * store's article are as absent as a missing one.
 */
export async function getPublishedProduct(
  db: DatabaseClient,
  {
    currencyCode,
    locale,
    slug,
    storeId,
  }: StoreScope & { currencyCode: Currency; locale: Locale; slug: string }
) {
  const found = await db.query.product.findFirst({
    columns: {
      categoryId: true,
      id: true,
      isAvailable: true,
      priceAmount: true,
      publishedAt: true,
      slug: true,
    },
    where: and(
      eq(product.storeId, storeId),
      eq(product.slug, slug),
      eq(product.status, "published")
    ),
    with: {
      category: {
        columns: { slug: true },
        with: { translations: { columns: { locale: true, name: true } } },
      },
      images: {
        columns: { height: true, id: true, url: true, width: true },
        orderBy: [asc(productImage.position), asc(productImage.id)],
        with: { translations: { columns: { altText: true, locale: true } } },
      },
      translations: {
        columns: {
          description: true,
          locale: true,
          seoDescription: true,
          seoTitle: true,
          title: true,
        },
      },
    },
  });

  if (!found) {
    throw new ORPCError("NOT_FOUND", { message: "Article not found" });
  }

  const text = pickTranslation(found.translations, locale);
  const categoryName = found.category
    ? pickTranslation(found.category.translations, locale)
    : null;

  return {
    category: found.category
      ? { name: categoryName?.name ?? "", slug: found.category.slug }
      : null,
    categoryId: found.categoryId,
    currencyCode,
    description: text?.description ?? "",
    id: found.id,
    images: found.images.map((image) => ({
      alt:
        pickTranslation(image.translations, locale)?.altText ??
        text?.title ??
        "",
      height: image.height,
      id: image.id,
      url: image.url,
      width: image.width,
    })),
    isAvailable: found.isAvailable,
    lang: text?.locale ?? locale,
    priceAmount: found.priceAmount ?? 0,
    publishedAt: found.publishedAt,
    seoDescription: text?.seoDescription ?? null,
    seoTitle: text?.seoTitle ?? null,
    slug: found.slug,
    title: text?.title ?? "",
  };
}

export type PublishedProduct = Awaited<ReturnType<typeof getPublishedProduct>>;

/**
 * Other published articles of the same category, newest first, without the
 * article itself. An article without a category has none.
 */
export async function listRelatedProducts(
  db: DatabaseClient,
  {
    categoryId,
    currencyCode,
    limit,
    locale,
    productId,
    storeId,
  }: StoreScope & {
    categoryId: number | null;
    currencyCode: Currency;
    limit: number;
    locale: Locale;
    productId: number;
  }
) {
  if (categoryId === null) {
    return [];
  }

  const rows = await db
    .select({ id: product.id })
    .from(product)
    .where(
      and(
        eq(product.storeId, storeId),
        eq(product.categoryId, categoryId),
        eq(product.status, "published"),
        ne(product.id, productId)
      )
    )
    .orderBy(desc(product.publishedAt), desc(product.id))
    .limit(limit);

  return await loadCards(db, {
    currencyCode,
    ids: rows.map((row) => row.id),
    locale,
  });
}

// ── Store-scoped writes ──────────────────────────────────────────────────

/** What publishing an article still needs (FER-010), in a stable order. */
export type PublishGap = "category" | "image" | "price" | "spanishTitle";

/**
 * The one rule for "ready to publish": at least one image, a category, a
 * price and a Spanish title. The wizard (FER-017) can show it; the service
 * re-derives it at commit and that answer wins.
 */
export function resolvePublishGaps(article: {
  categoryId: number | null;
  imageCount: number;
  priceAmount: number | null;
  translations: readonly { locale: Locale; title: string }[];
}): PublishGap[] {
  const gaps: PublishGap[] = [];

  if (article.imageCount === 0) {
    gaps.push("image");
  }

  if (article.categoryId === null) {
    gaps.push("category");
  }

  if (article.priceAmount === null) {
    gaps.push("price");
  }

  if (
    !article.translations.some(
      (row) => row.locale === "es" && row.title.trim() !== ""
    )
  ) {
    gaps.push("spanishTitle");
  }

  return gaps;
}

function publishRefused(gaps: PublishGap[]) {
  return new ORPCError("BAD_REQUEST", {
    message: `The article cannot be published yet. Missing: ${gaps.join(", ")}`,
  });
}

function notFound() {
  return new ORPCError("NOT_FOUND", { message: "Article not found" });
}

/** The category, if it is the store's: an id from input is not trusted. */
async function assertStoreCategory(
  tx: DatabaseClient,
  { categoryId, storeId }: StoreScope & { categoryId: number | null }
) {
  if (categoryId === null) {
    return;
  }

  const found = await tx.query.category.findFirst({
    columns: { id: true },
    where: and(eq(category.id, categoryId), eq(category.storeId, storeId)),
  });

  if (!found) {
    throw new ORPCError("BAD_REQUEST", { message: "Category not found" });
  }
}

/**
 * A free slug for the article from its Spanish title, unique in the store.
 * Every writer that allocates one in a store takes the same advisory lock
 * first, held to the end of its transaction, so two articles with the same
 * title never get the same slug.
 */
async function allocateSlug(
  tx: DatabaseClient,
  {
    excludeId,
    storeId,
    title,
  }: StoreScope & { excludeId: number | null; title: string }
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`product.slug:${storeId}`}))`
  );
  const base = slugify(title, PRODUCT_SLUG_FALLBACK);
  const taken = await tx
    .select({ slug: product.slug })
    .from(product)
    .where(
      and(
        eq(product.storeId, storeId),
        sql`${product.slug} like ${`${base}%`}`,
        excludeId === null ? undefined : ne(product.id, excludeId)
      )
    );

  return firstFreeSlug(base, new Set(taken.map((row) => row.slug)));
}

function spanishTitle(
  translations: CreateProductValues["translations"]
): string {
  // The schema requires the Spanish row.
  return translations.find((row) => row.locale === "es")?.title ?? "";
}

/** The texts as rows of `product_translation`, column by column. */
function toTranslationRows(
  productId: number,
  translations: CreateProductValues["translations"]
) {
  return translations.map((row) => ({
    description: row.description,
    locale: row.locale,
    productId,
    seoDescription: row.seoDescription,
    seoTitle: row.seoTitle,
    title: row.title,
  }));
}

/** A new draft article of the store, its slug from the Spanish title. */
export async function createProduct(
  tx: DatabaseClient,
  {
    storeId,
    values,
  }: StoreScope & { values: Omit<CreateProductValues, "storeSlug"> }
) {
  await assertStoreCategory(tx, { categoryId: values.categoryId, storeId });
  const slug = await allocateSlug(tx, {
    excludeId: null,
    storeId,
    title: spanishTitle(values.translations),
  });
  const [created] = await tx
    .insert(product)
    .values({
      categoryId: values.categoryId,
      isAvailable: values.isAvailable,
      priceAmount: values.priceAmount,
      slug,
      status: "draft",
      storeId,
    })
    .returning({ id: product.id, slug: product.slug, status: product.status });

  if (!created) {
    throw new Error("Inserting an article returned no row");
  }

  await tx
    .insert(productTranslation)
    .values(toTranslationRows(created.id, values.translations));

  return created;
}

/** The article of the store, locked for the rest of the transaction. */
async function lockStoreProduct(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  const [found] = await tx
    .select({
      categoryId: product.categoryId,
      id: product.id,
      priceAmount: product.priceAmount,
      publishedAt: product.publishedAt,
      slug: product.slug,
      status: product.status,
    })
    .from(product)
    .where(and(eq(product.id, id), eq(product.storeId, storeId)))
    .for("update");

  if (!found) {
    throw notFound();
  }

  return found;
}

async function countImages(tx: DatabaseClient, productId: number) {
  const [row] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(productImage)
    .where(eq(productImage.productId, productId));

  return row?.total ?? 0;
}

/**
 * Replaces the article's fields and texts. Its slug follows the Spanish
 * title until the article is first published, then stays. A published
 * article must stay publishable: an edit that takes its category or price
 * away is refused (unpublish it first).
 */
export async function updateProduct(
  tx: DatabaseClient,
  {
    storeId,
    values,
  }: StoreScope & { values: Omit<UpdateProductValues, "storeSlug"> }
) {
  const current = await lockStoreProduct(tx, { id: values.id, storeId });
  await assertStoreCategory(tx, { categoryId: values.categoryId, storeId });

  if (current.status === "published") {
    const gaps = resolvePublishGaps({
      categoryId: values.categoryId,
      imageCount: await countImages(tx, current.id),
      priceAmount: values.priceAmount,
      translations: values.translations,
    });

    if (gaps.length > 0) {
      throw publishRefused(gaps);
    }
  }

  const slug =
    current.publishedAt === null
      ? await allocateSlug(tx, {
          excludeId: current.id,
          storeId,
          title: spanishTitle(values.translations),
        })
      : current.slug;

  const [updated] = await tx
    .update(product)
    .set({
      categoryId: values.categoryId,
      isAvailable: values.isAvailable,
      priceAmount: values.priceAmount,
      slug,
    })
    .where(and(eq(product.id, current.id), eq(product.storeId, storeId)))
    .returning({ id: product.id, slug: product.slug, status: product.status });

  await tx
    .delete(productTranslation)
    .where(eq(productTranslation.productId, current.id));
  await tx
    .insert(productTranslation)
    .values(toTranslationRows(current.id, values.translations));

  return updated ?? { id: current.id, slug, status: current.status };
}

/**
 * Publishes the article once it meets the rule in `resolvePublishGaps`,
 * re-derived here under the row's lock. The first publication stamps
 * `publishedAt` from the database clock; later ones keep it, and with it the
 * slug.
 */
export async function publishProduct(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  const current = await lockStoreProduct(tx, { id, storeId });
  const translations = await tx.query.productTranslation.findMany({
    columns: { locale: true, title: true },
    where: eq(productTranslation.productId, current.id),
  });
  const gaps = resolvePublishGaps({
    categoryId: current.categoryId,
    imageCount: await countImages(tx, current.id),
    priceAmount: current.priceAmount,
    translations,
  });

  if (gaps.length > 0) {
    throw publishRefused(gaps);
  }

  const [published] = await tx
    .update(product)
    .set({
      publishedAt: sql`coalesce(${product.publishedAt}, clock_timestamp())`,
      status: "published",
    })
    .where(and(eq(product.id, current.id), eq(product.storeId, storeId)))
    .returning({ id: product.id, slug: product.slug, status: product.status });

  return (
    published ?? { id: current.id, slug: current.slug, status: "published" }
  );
}

/** Back to draft: off the storefront, its slug and first date kept. */
export async function unpublishProduct(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  const [updated] = await tx
    .update(product)
    .set({ status: "draft" })
    .where(and(eq(product.id, id), eq(product.storeId, storeId)))
    .returning({ id: product.id, slug: product.slug, status: product.status });

  if (!updated) {
    throw notFound();
  }

  return updated;
}

/** Marks the article available or not, without unpublishing it. */
export async function setProductAvailability(
  tx: DatabaseClient,
  {
    id,
    isAvailable,
    storeId,
  }: StoreScope & { id: number; isAvailable: boolean }
) {
  const [updated] = await tx
    .update(product)
    .set({ isAvailable })
    .where(and(eq(product.id, id), eq(product.storeId, storeId)))
    .returning({ id: product.id, isAvailable: product.isAvailable });

  if (!updated) {
    throw notFound();
  }

  return updated;
}

/** Deletes the article with its texts and images. */
export async function deleteProduct(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  const [deleted] = await tx
    .delete(product)
    .where(and(eq(product.id, id), eq(product.storeId, storeId)))
    .returning({ id: product.id });

  if (!deleted) {
    throw notFound();
  }

  return deleted;
}

/**
 * Puts the article's images in the order given, which must name each of its
 * images exactly once: a partial or foreign list is refused, never applied
 * in part. One UPDATE for all of them.
 */
export async function reorderProductImages(
  tx: DatabaseClient,
  { id, imageIds, storeId }: StoreScope & { id: number; imageIds: number[] }
) {
  const current = await lockStoreProduct(tx, { id, storeId });
  const images = await tx
    .select({ id: productImage.id })
    .from(productImage)
    .where(eq(productImage.productId, current.id));
  const own = new Set(images.map((image) => image.id));

  if (
    imageIds.length !== own.size ||
    new Set(imageIds).size !== imageIds.length ||
    imageIds.some((imageId) => !own.has(imageId))
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Give every image of the article, once each",
    });
  }

  const positions = sql.join(
    imageIds.map((imageId, index) => sql`when ${imageId} then ${index}::int`),
    sql` `
  );

  await tx
    .update(productImage)
    .set({ position: sql`case ${productImage.id} ${positions} end` })
    .where(
      and(
        eq(productImage.productId, current.id),
        inArray(productImage.id, imageIds)
      )
    );

  return { id: current.id, imageIds };
}
