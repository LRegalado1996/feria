import { ORPCError } from "@orpc/server";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { coverOf, imageOf } from "@/lib/catalog/cover";
import { categoryPath } from "@/lib/catalog/paths";
import { RELATED_FILL_BELOW, RELATED_POOL_SIZE } from "@/lib/catalog/related";
import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import type {
  CreateProductValues,
  ListProductsValues,
  ProductCursor,
  ProductSort,
  UpdateProductValues,
} from "@/lib/schemas/catalog";
import type { Currency } from "@/lib/utils/format";
import { firstFreeSlug, slugify } from "@/lib/utils/slugify";
import type { DatabaseClient } from "@/server/db";
import {
  category,
  product,
  productAttributeValue,
  productImage,
  productTranslation,
  store,
} from "@/server/db/schema";

/**
 * How much of a slug's base every suffixed variant still starts with: the
 * column holds 80 characters and a suffix up to `-99999` takes 6.
 */
const SUFFIXED_PREFIX_LENGTH = 74;

/** What names an article whose title has nothing readable in it. */
const PRODUCT_SLUG_FALLBACK = "articulo";

/** The store a catalog read or write is about, already resolved and trusted. */
interface StoreScope {
  storeId: number;
}

// ── Public reads ─────────────────────────────────────────────────────────

/**
 * A store's categories in their order, each with its name in `locale` (or
 * the language it has), the language it came in, for `lang`, its group
 * (`parentId`, FER-043) and its page's address.
 */
export async function listCategories(
  db: DatabaseClient,
  { locale, storeId }: StoreScope & { locale: Locale }
) {
  const rows = await db.query.category.findMany({
    columns: { id: true, parentId: true, position: true, slug: true },
    orderBy: [asc(category.position), asc(category.id)],
    where: eq(category.storeId, storeId),
    with: {
      translations: { columns: { locale: true, name: true } },
    },
  });
  const slugOf = new Map(rows.map((row) => [row.id, row.slug]));

  return rows.map(({ translations, ...row }) => {
    const name = pickTranslation(translations, locale);
    const parentSlug =
      row.parentId === null ? null : (slugOf.get(row.parentId) ?? null);

    return {
      ...row,
      lang: name?.locale ?? locale,
      name: name?.name ?? "",
      path: categoryPath({ parentSlug, slug: row.slug }),
    };
  });
}

export type PublicCategory = Awaited<ReturnType<typeof listCategories>>[number];

/**
 * One category's page (FER-043) by its slug, in `locale`: its name, its
 * group's, the categories it holds when it is a group, its texts for search
 * engines and its cover; `null` when the store has no such category.
 */
export async function getCategoryPage(
  db: DatabaseClient,
  { locale, slug, storeId }: StoreScope & { locale: Locale; slug: string }
) {
  const textColumns = {
    columns: {
      coverAlt: true,
      locale: true,
      name: true,
      seoDescription: true,
      seoTitle: true,
    },
  } as const;
  const found = await db.query.category.findFirst({
    columns: {
      coverHeight: true,
      coverPhoneHeight: true,
      coverPhoneUrl: true,
      coverPhoneWidth: true,
      coverUrl: true,
      coverWidth: true,
      id: true,
      slug: true,
    },
    where: and(eq(category.storeId, storeId), eq(category.slug, slug)),
    with: {
      children: {
        columns: { slug: true },
        orderBy: [asc(category.position), asc(category.id)],
        with: { translations: { columns: { locale: true, name: true } } },
      },
      parent: {
        columns: { slug: true },
        with: { translations: { columns: { locale: true, name: true } } },
      },
      translations: textColumns,
    },
  });

  if (!found) {
    return null;
  }

  const text = pickTranslation(found.translations, locale);
  const name = text?.name ?? "";
  const parent = found.parent
    ? {
        lang:
          pickTranslation(found.parent.translations, locale)?.locale ?? locale,
        name: pickTranslation(found.parent.translations, locale)?.name ?? "",
        path: categoryPath({ parentSlug: null, slug: found.parent.slug }),
        slug: found.parent.slug,
      }
    : null;

  return {
    children: found.children.map((child) => {
      const childName = pickTranslation(child.translations, locale);

      return {
        lang: childName?.locale ?? locale,
        name: childName?.name ?? "",
        path: categoryPath({ parentSlug: found.slug, slug: child.slug }),
        slug: child.slug,
      };
    }),
    cover: coverOf(
      {
        computer: imageOf(found.coverUrl, found.coverWidth, found.coverHeight),
        phone: imageOf(
          found.coverPhoneUrl,
          found.coverPhoneWidth,
          found.coverPhoneHeight
        ),
      },
      text?.coverAlt ?? null,
      name
    ),
    id: found.id,
    lang: text?.locale ?? locale,
    name,
    parent,
    path: categoryPath({ parentSlug: parent?.slug ?? null, slug: found.slug }),
    seoDescription: text?.seoDescription ?? null,
    seoTitle: text?.seoTitle ?? null,
    slug: found.slug,
  };
}

/**
 * The cover of the page of all the store's articles (FER-043), held on the
 * store's row, described in `locale` (else the language it has, else by
 * `fallbackAlt`); `null` without one.
 */
export async function getAllArticlesCover(
  db: DatabaseClient,
  {
    fallbackAlt,
    locale,
    storeId,
  }: StoreScope & { fallbackAlt: string; locale: Locale }
) {
  const found = await db.query.store.findFirst({
    columns: {
      catalogCoverHeight: true,
      catalogCoverPhoneHeight: true,
      catalogCoverPhoneUrl: true,
      catalogCoverPhoneWidth: true,
      catalogCoverUrl: true,
      catalogCoverWidth: true,
    },
    where: eq(store.id, storeId),
    with: {
      translations: { columns: { catalogCoverAlt: true, locale: true } },
    },
  });

  if (!found) {
    return null;
  }

  return coverOf(
    {
      computer: imageOf(
        found.catalogCoverUrl,
        found.catalogCoverWidth,
        found.catalogCoverHeight
      ),
      phone: imageOf(
        found.catalogCoverPhoneUrl,
        found.catalogCoverPhoneWidth,
        found.catalogCoverPhoneHeight
      ),
    },
    pickTranslation(found.translations, locale)?.catalogCoverAlt ?? null,
    fallbackAlt
  );
}

export type CategoryPage = NonNullable<
  Awaited<ReturnType<typeof getCategoryPage>>
>;

/** `%`, `_` and the escape itself, taken literally inside an ILIKE. */
function likePattern(search: string): string {
  return `%${search.replaceAll(/[\\%_]/gu, (char) => `\\${char}`)}%`;
}

/**
 * Whether the article's text in `locale` (or its Spanish text, when it has
 * none in `locale`: what the visitor is shown) holds `search` in its title or
 * description, blind to case and accents ("nandu" finds "Ñandú").
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
    or(
      sql`unaccent(${shown.title}) ilike unaccent(${pattern})`,
      sql`unaccent(${shown.description}) ilike unaccent(${pattern})`
    )
  )})`;
}

/**
 * Whether the article (joined to its category) is in the category at
 * `slug`, or in one of its categories when it is a group (FER-043): a
 * group's page lists everything in it.
 */
function inCategory(slug: string): SQL {
  const group = alias(category, "category_group");
  const fromGroup = sql`${category} as ${sql.identifier("category_group")}`;

  return sql`(${eq(category.slug, slug)} or exists (select 1 from ${fromGroup} where ${and(
    eq(group.id, category.parentId),
    eq(group.storeId, category.storeId),
    eq(group.slug, slug)
  )}))`;
}

/**
 * Whether the article carries one of `valueIds` (FER-033): the values of one
 * filter are alternatives, and each filter adds its own condition.
 */
function carriesOneOf(valueIds: number[]): SQL {
  return sql`exists (select 1 from ${productAttributeValue} where ${and(
    eq(productAttributeValue.productId, product.id),
    inArray(productAttributeValue.attributeValueId, valueIds)
  )})`;
}

/**
 * The rows after `cursor` in `sort`'s order. A cursor carries the sort that
 * made it and that sort's key; one from another sort is refused, not
 * misread (both price orders share a key, read the other way round).
 */
function afterCursor(cursor: ProductCursor, sort: ProductSort): SQL {
  if (cursor.sort === sort) {
    if (sort === "newest" && cursor.publishedAt !== undefined) {
      return sql`(${product.publishedAt}, ${product.id}) < (${cursor.publishedAt}::timestamptz, ${cursor.id}::int)`;
    }

    if (sort !== "newest" && cursor.priceAmount !== undefined) {
      return sort === "price_asc"
        ? sql`(${product.priceAmount}, ${product.id}) > (${cursor.priceAmount}::int, ${cursor.id}::int)`
        : sql`(${product.priceAmount}, ${product.id}) < (${cursor.priceAmount}::int, ${cursor.id}::int)`;
    }
  }

  throw new ORPCError("BAD_REQUEST", {
    message: "That cursor belongs to another sort",
  });
}

/** `sort`'s order, ending in the id so a page never repeats or skips a row. */
function orderOf(sort: ProductSort) {
  if (sort === "price_asc") {
    return [asc(product.priceAmount), asc(product.id)];
  }

  if (sort === "price_desc") {
    return [desc(product.priceAmount), desc(product.id)];
  }

  return [desc(product.publishedAt), desc(product.id)];
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
    // Published again here, not only in the list's query: under READ
    // COMMITTED an article unpublished between the two statements would
    // otherwise come back with whatever it was edited into.
    where: and(inArray(product.id, ids), eq(product.status, "published")),
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
 * The cart's articles as the shop has them now (FER-026): the cards of the
 * ones still published in this store, in the order asked; an id of another
 * store, a draft or a deleted article is left out, which the cart shows as
 * gone. Prices are the shop's, never the cart's.
 */
export async function listCartProducts(
  db: DatabaseClient,
  {
    currencyCode,
    ids,
    locale,
    storeId,
  }: StoreScope & { currencyCode: Currency; ids: number[]; locale: Locale }
) {
  const owned = await db
    .select({ id: product.id })
    .from(product)
    .where(
      and(
        eq(product.storeId, storeId),
        eq(product.status, "published"),
        inArray(product.id, ids)
      )
    );
  const ownIds = new Set(owned.map((row) => row.id));

  return await loadCards(db, {
    currencyCode,
    ids: ids.filter((id) => ownIds.has(id)),
    locale,
  });
}

/**
 * One page of a store's published articles, newest first or by price,
 * narrowed by category, search and filters. Keyset pagination on the sort's
 * key and the id: a row inserted while the visitor scrolls never shifts the
 * next page.
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
    sort = "newest",
    storeId,
    valueGroups = [],
  }: StoreScope &
    Omit<ListProductsValues, "filters" | "sort"> & {
      currencyCode: Currency;
      sort?: ProductSort;
      /** The filters' value ids, one group per filter (`resolveCatalogFilters`). */
      valueGroups?: number[][];
    }
) {
  const page = await db
    .select({
      id: product.id,
      priceAmount: product.priceAmount,
      publishedAt: product.publishedAt,
    })
    .from(product)
    .leftJoin(
      category,
      and(eq(category.id, product.categoryId), eq(category.storeId, storeId))
    )
    .where(
      and(
        eq(product.storeId, storeId),
        eq(product.status, "published"),
        categorySlug === undefined ? undefined : inCategory(categorySlug),
        q === undefined ? undefined : matchesSearch(q, locale),
        ...valueGroups.map((group) => carriesOneOf(group)),
        cursor === undefined ? undefined : afterCursor(cursor, sort)
      )
    )
    .orderBy(...orderOf(sort))
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
    nextCursor: page.length > limit ? cursorAt(last, sort) : null,
  };
}

/** The cursor after `row` in `sort`'s order, carrying that sort and its key. */
function cursorAt(
  row:
    | { id: number; priceAmount: number | null; publishedAt: Date | null }
    | undefined,
  sort: ProductSort
): ProductCursor | null {
  if (!row) {
    return null;
  }

  if (sort === "newest") {
    return row.publishedAt
      ? { id: row.id, publishedAt: row.publishedAt.toISOString(), sort }
      : null;
  }

  // A published article always has a price (the database's check).
  return row.priceAmount === null
    ? null
    : { id: row.id, priceAmount: row.priceAmount, sort };
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
        with: {
          parent: {
            columns: { slug: true },
            with: { translations: { columns: { locale: true, name: true } } },
          },
          translations: { columns: { locale: true, name: true } },
        },
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
      ? articleCategory(found.category, categoryName?.name ?? "", locale)
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
 * An article's category as its page shows it: its name, its page's address
 * and the group it is in, for the article's breadcrumb (FER-043).
 */
function articleCategory(
  found: {
    parent: {
      slug: string;
      translations: { locale: Locale; name: string }[];
    } | null;
    slug: string;
  },
  name: string,
  locale: Locale
) {
  const group = found.parent;

  return {
    group: group
      ? {
          name: pickTranslation(group.translations, locale)?.name ?? "",
          path: categoryPath({ parentSlug: null, slug: group.slug }),
        }
      : null,
    name,
    path: categoryPath({ parentSlug: group?.slug ?? null, slug: found.slug }),
    slug: found.slug,
  };
}

/**
 * The id and category of a published article of the store, or NOT_FOUND:
 * what the related list needs, without the article's images and texts.
 */
export async function getPublishedProductRef(
  db: DatabaseClient,
  { slug, storeId }: StoreScope & { slug: string }
) {
  const found = await db.query.product.findFirst({
    columns: { categoryId: true, id: true },
    where: and(
      eq(product.storeId, storeId),
      eq(product.slug, slug),
      eq(product.status, "published")
    ),
  });

  if (!found) {
    throw notFound();
  }

  return found;
}

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

/**
 * What the article's page picks its suggestions from (FER-039,
 * `src/lib/catalog/related.ts`): up to `RELATED_POOL_SIZE` other published
 * articles of its category, newest first, and, only when the category has
 * fewer than `RELATED_FILL_BELOW` of them, up to as many from the rest of
 * the store (outside the category, or in none). The article is never in it.
 */
export async function listRelatedPool(
  db: DatabaseClient,
  {
    categoryId,
    currencyCode,
    locale,
    productId,
    storeId,
  }: StoreScope & {
    categoryId: number | null;
    currencyCode: Currency;
    locale: Locale;
    productId: number;
  }
) {
  const others = and(
    eq(product.storeId, storeId),
    eq(product.status, "published"),
    ne(product.id, productId)
  );
  const idsWhere = async (where: SQL | undefined) =>
    (
      await db
        .select({ id: product.id })
        .from(product)
        .where(where)
        .orderBy(desc(product.publishedAt), desc(product.id))
        .limit(RELATED_POOL_SIZE)
    ).map((row) => row.id);

  const sameIds =
    categoryId === null
      ? []
      : await idsWhere(and(others, eq(product.categoryId, categoryId)));
  const restIds =
    sameIds.length >= RELATED_FILL_BELOW
      ? []
      : await idsWhere(
          categoryId === null
            ? others
            : and(
                others,
                or(
                  isNull(product.categoryId),
                  ne(product.categoryId, categoryId)
                )
              )
        );
  const cards = await loadCards(db, {
    currencyCode,
    ids: [...sameIds, ...restIds],
    locale,
  });
  const inCategory = new Set(sameIds);

  return {
    others: cards.filter((card) => !inCategory.has(card.id)),
    same: cards.filter((card) => inCategory.has(card.id)),
  };
}

export type RelatedPoolCards = Awaited<ReturnType<typeof listRelatedPool>>;

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

/**
 * The category, if it is the store's: an id from input is not trusted. Its
 * row is locked `share` to the end of the transaction, so a category being
 * deleted at the same time is either gone (refused here) or waits for this
 * write (FER-016).
 */
async function assertStoreCategory(
  tx: DatabaseClient,
  { categoryId, storeId }: StoreScope & { categoryId: number | null }
) {
  if (categoryId === null) {
    return;
  }

  const [found] = await tx
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.storeId, storeId)))
    .for("share");

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
        // The prefix a suffixed slug keeps once the base is cut to fit it
        // (`base-2` cuts a full-length base), not the whole base.
        sql`${product.slug} like ${`${base.slice(0, SUFFIXED_PREFIX_LENGTH)}%`}`,
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
  { storeId, values }: StoreScope & { values: CreateProductValues }
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
  { storeId, values }: StoreScope & { values: UpdateProductValues }
) {
  // The category before the article, the order a category's deletion takes
  // them in: the other way round, an edit and that deletion could each hold
  // the lock the other waits for.
  await assertStoreCategory(tx, { categoryId: values.categoryId, storeId });
  const current = await lockStoreProduct(tx, { id: values.id, storeId });

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

  if (!updated) {
    throw new Error("Updating a locked article matched no row");
  }

  return updated;
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

  if (!published) {
    throw new Error("Publishing a locked article matched no row");
  }

  return published;
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
