import { ORPCError } from "@orpc/server";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";

import { isOwnBlobUrl } from "@/lib/blob/paths";
import {
  type PublishGap,
  publishRefusalMessage,
  resolvePublishGaps,
} from "@/lib/catalog/publish-gaps";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import {
  type CreateProductValues,
  type ListStoreProductsValues,
  type ProductImageValues,
  type ProductTranslationValues,
  type SortDirection,
  STORE_PRODUCT_SORT_DIRECTIONS,
  STORE_PRODUCTS_COUNT_CAP,
  type StoreProductSort,
  type UpdateProductValues,
} from "@/lib/schemas/catalog";
import { firstFreeSlug, slugify } from "@/lib/utils/slugify";
import type { DatabaseClient } from "@/server/db";
import {
  category,
  categoryTranslation,
  product,
  productAttributeValue,
  productImage,
  productTranslation,
  store,
} from "@/server/db/schema";
import {
  replaceProductAttributeValues,
  resolveCatalogFilters,
} from "@/server/services/attribute";
import { carriesOneOf, likePattern } from "@/server/services/catalog";
import type { BlobStore } from "@/server/services/upload";

/**
 * The admin's side of the articles (FER-010, FER-017): the writes, every one
 * scoped to the store and run under the article's row lock, and the reads the
 * wizard and the article list make, drafts included. What the storefront
 * reads is `catalog.ts`'s, published articles only.
 */

/** The store a write or a read is about, already resolved and trusted. */
interface StoreScope {
  storeId: number;
}

/**
 * How much of a slug's base every suffixed variant still starts with: the
 * column holds 80 characters and a suffix up to `-99999` takes 6.
 */
const SUFFIXED_PREFIX_LENGTH = 74;

/**
 * What names an article whose title has nothing readable in it, a blank
 * draft's included (`articulo`, `articulo-2`…), until it gets a title.
 */
const PRODUCT_SLUG_FALLBACK = "articulo";

// ── The rule for publishing ──────────────────────────────────────────────

// `resolvePublishGaps` (`src/lib/catalog/publish-gaps.ts`) is the rule: the
// wizard shows its answer as the article is typed, and every write here
// re-derives it under the article's lock.

function publishRefused(gaps: PublishGap[]) {
  return new ORPCError("BAD_REQUEST", {
    message: publishRefusalMessage(gaps),
  });
}

function notFound() {
  return new ORPCError("NOT_FOUND", { message: "Article not found" });
}

// ── Pieces every write shares ────────────────────────────────────────────

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
  translations: readonly ProductTranslationValues[]
): string {
  // The schema requires the Spanish row; its title may still be blank.
  return translations.find((row) => row.locale === "es")?.title ?? "";
}

/** `excluded."<column>"`: the value an upsert's conflicting row proposed. */
function excluded(column: PgColumn) {
  return sql`excluded.${sql.identifier(column.name)}`;
}

/**
 * Makes the article's texts the ones given: a language it keeps is updated
 * in place (its row and id stay), a new one is inserted, and one left out is
 * deleted. A blank draft keeps a Spanish row whose title is `""`: the column
 * is NOT NULL, and an empty string says "not named yet" without a second
 * shape for the same draft (no row) that every reader would have to handle.
 */
async function writeTranslations(
  tx: DatabaseClient,
  productId: number,
  translations: readonly ProductTranslationValues[]
) {
  await tx.delete(productTranslation).where(
    and(
      eq(productTranslation.productId, productId),
      notInArray(
        productTranslation.locale,
        translations.map((row) => row.locale)
      )
    )
  );
  await tx
    .insert(productTranslation)
    .values(
      translations.map((row) => ({
        description: row.description,
        locale: row.locale,
        productId,
        seoDescription: row.seoDescription,
        seoTitle: row.seoTitle,
        title: row.title,
      }))
    )
    .onConflictDoUpdate({
      set: {
        description: excluded(productTranslation.description),
        seoDescription: excluded(productTranslation.seoDescription),
        seoTitle: excluded(productTranslation.seoTitle),
        title: excluded(productTranslation.title),
        updatedAt: excluded(productTranslation.updatedAt),
      },
      target: [productTranslation.productId, productTranslation.locale],
    });
}

/** A photo the article holds, as its row has it. */
interface StoredImage {
  id: number;
  position: number;
  url: string;
}

/**
 * What saving `wanted` (the photos in their new order) does to the photos
 * the article holds: a photo it already has, matched by its address, keeps
 * its row (its id and its alt texts) and only moves; a new one must be an
 * upload of this deployment for articles (`isOwnBlobUrl`, the address comes
 * from the request); a photo no longer listed is deleted, and its address
 * handed back for its file to be deleted once this commits. A stored address
 * that is no upload (the seed's `/seed/...`) is accepted only because the
 * article already holds it.
 */
function planImages(
  stored: readonly StoredImage[],
  wanted: readonly ProductImageValues[],
  blobStore: BlobStore | null
) {
  const held = new Map<string, StoredImage>();

  for (const image of stored) {
    if (!held.has(image.url)) {
      held.set(image.url, image);
    }
  }

  const moved: { id: number; position: number }[] = [];
  const added: (ProductImageValues & { position: number })[] = [];
  const keptIds = new Set<number>();

  for (const [position, image] of wanted.entries()) {
    const own = held.get(image.url);

    if (own) {
      keptIds.add(own.id);

      if (own.position !== position) {
        moved.push({ id: own.id, position });
      }
    } else if (
      blobStore !== null &&
      isOwnBlobUrl(image.url, { ...blobStore, purpose: "product" })
    ) {
      added.push({ ...image, position });
    } else {
      throw new ORPCError("BAD_REQUEST", {
        message: "An article photo must be one uploaded to this store",
      });
    }
  }

  const removed = stored.filter((image) => !keptIds.has(image.id));
  const wantedUrls = new Set(wanted.map((image) => image.url));

  return {
    added,
    discarded: [
      ...new Set(
        removed.map((image) => image.url).filter((url) => !wantedUrls.has(url))
      ),
    ],
    moved,
    removedIds: removed.map((image) => image.id),
  };
}

/** Applies `planImages`'s answer: one statement per kind of change, at most. */
async function writeImages(
  tx: DatabaseClient,
  productId: number,
  plan: ReturnType<typeof planImages>
) {
  if (plan.removedIds.length > 0) {
    await tx
      .delete(productImage)
      .where(
        and(
          eq(productImage.productId, productId),
          inArray(productImage.id, plan.removedIds)
        )
      );
  }

  if (plan.moved.length > 0) {
    const positions = sql.join(
      plan.moved.map(
        ({ id, position }) => sql`when ${id} then ${position}::int`
      ),
      sql` `
    );

    await tx
      .update(productImage)
      .set({ position: sql`case ${productImage.id} ${positions} end` })
      .where(
        and(
          eq(productImage.productId, productId),
          inArray(
            productImage.id,
            plan.moved.map(({ id }) => id)
          )
        )
      );
  }

  if (plan.added.length > 0) {
    await tx.insert(productImage).values(
      plan.added.map((image) => ({
        height: image.height,
        position: image.position,
        productId,
        url: image.url,
        width: image.width,
      }))
    );
  }
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

/** The article's photos in their order, as `planImages` reads them. */
async function readImages(tx: DatabaseClient, productId: number) {
  return await tx
    .select({
      id: productImage.id,
      position: productImage.position,
      url: productImage.url,
    })
    .from(productImage)
    .where(eq(productImage.productId, productId))
    .orderBy(asc(productImage.position), asc(productImage.id));
}

/**
 * Writes what the article holds besides its own row: its texts, its photos
 * and its filter values, the article's row lock already held.
 */
async function writeContents(
  tx: DatabaseClient,
  {
    images,
    productId,
    storeId,
    values,
  }: StoreScope & {
    images: ReturnType<typeof planImages>;
    productId: number;
    values: CreateProductValues;
  }
) {
  await writeTranslations(tx, productId, values.translations);
  await writeImages(tx, productId, images);
  await replaceProductAttributeValues(tx, {
    productId,
    storeId,
    valueIds: values.attributeValueIds,
  });
}

// ── Writes ───────────────────────────────────────────────────────────────

/** What a write answers: enough for the wizard to go on without a read. */
const savedColumns = {
  id: product.id,
  slug: product.slug,
  status: product.status,
  updatedAt: product.updatedAt,
};

/**
 * A new draft article of the store with everything the wizard holds (FER-017),
 * which creates it as soon as its first photo is uploaded, before it has a
 * title: the slug then comes from the fallback until a Spanish title names
 * it. It takes the store's next place in the article order, the column's
 * default (FER-044). Answers what publishing it still needs.
 */
export async function createProduct(
  tx: DatabaseClient,
  {
    blobStore,
    storeId,
    values,
  }: StoreScope & { blobStore: BlobStore | null; values: CreateProductValues }
) {
  // Every photo is new: checked before anything is written.
  const images = planImages([], values.images, blobStore);
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
    .returning(savedColumns);

  if (!created) {
    throw new Error("Inserting an article returned no row");
  }

  await writeContents(tx, { images, productId: created.id, storeId, values });

  return {
    ...created,
    publishGaps: resolvePublishGaps({
      categoryId: values.categoryId,
      imageCount: values.images.length,
      priceAmount: values.priceAmount,
      translations: values.translations,
    }),
  };
}

/**
 * Saves the whole article as the wizard holds it (FER-017): its fields, its
 * texts, its photos in order and its filter values, under the article's row
 * lock, so two saves of the same article (an autosave overlapping the next)
 * run one after the other and the last one's article is what stays. Saving
 * the same values again changes nothing but `updatedAt`.
 *
 * Its slug follows the Spanish title until the article is first published,
 * then stays. A published article must stay publishable: a save that would
 * leave it a gap (its category, price, last photo or a title) is refused
 * (unpublish it first). Answers what publishing still needs, and the
 * addresses of the photos it no longer shows, for the caller to delete those
 * files once this commits.
 */
export async function updateProduct(
  tx: DatabaseClient,
  {
    blobStore,
    storeId,
    values,
  }: StoreScope & { blobStore: BlobStore | null; values: UpdateProductValues }
) {
  // The category before the article, the order a category's deletion takes
  // them in: the other way round, an edit and that deletion could each hold
  // the lock the other waits for.
  await assertStoreCategory(tx, { categoryId: values.categoryId, storeId });
  const current = await lockStoreProduct(tx, { id: values.id, storeId });
  const images = planImages(
    await readImages(tx, current.id),
    values.images,
    blobStore
  );
  const publishGaps = resolvePublishGaps({
    categoryId: values.categoryId,
    imageCount: values.images.length,
    priceAmount: values.priceAmount,
    translations: values.translations,
  });

  if (current.status === "published" && publishGaps.length > 0) {
    throw publishRefused(publishGaps);
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
    .returning(savedColumns);

  if (!updated) {
    throw new Error("Updating a locked article matched no row");
  }

  await writeContents(tx, { images, productId: current.id, storeId, values });

  return {
    ...updated,
    discardedImageUrls: images.discarded,
    publishGaps,
  };
}

async function countImages(tx: DatabaseClient, productId: number) {
  const [row] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(productImage)
    .where(eq(productImage.productId, productId));

  return row?.total ?? 0;
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

/**
 * Deletes the article with its texts and images, and answers the addresses
 * its images had, for the caller to delete those files once this commits
 * (FER-011). The article is locked first, so a save meanwhile waits and its
 * photos are either listed here or never written.
 */
export async function deleteProduct(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  const current = await lockStoreProduct(tx, { id, storeId });
  const images = await tx
    .select({ url: productImage.url })
    .from(productImage)
    .where(eq(productImage.productId, current.id));
  const [deleted] = await tx
    .delete(product)
    .where(and(eq(product.id, current.id), eq(product.storeId, storeId)))
    .returning({ id: product.id });

  if (!deleted) {
    throw new Error("Deleting a locked article matched no row");
  }

  return { id: deleted.id, imageUrls: images.map((image) => image.url) };
}

// ── The admin's reads ────────────────────────────────────────────────────

/** The store's currency, which every price of its articles is in. */
async function storeCurrency(db: DatabaseClient, storeId: number) {
  const [found] = await db
    .select({ currencyCode: store.currencyCode })
    .from(store)
    .where(eq(store.id, storeId));

  if (!found) {
    throw new ORPCError("NOT_FOUND", { message: "Store not found" });
  }

  return found.currencyCode;
}

/**
 * One article of the store as the wizard restores it (FER-017), draft or
 * published: its fields, every language's texts, its photos in order, its
 * filter values, the store's currency and what publishing it still needs.
 * One statement, so every part comes from the same moment. An article of
 * another store, or none, is NOT_FOUND.
 */
export async function getStoreProduct(
  db: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  const found = await db.query.product.findFirst({
    columns: {
      categoryId: true,
      id: true,
      isAvailable: true,
      priceAmount: true,
      publishedAt: true,
      slug: true,
      status: true,
      updatedAt: true,
    },
    where: and(eq(product.id, id), eq(product.storeId, storeId)),
    with: {
      attributeValues: {
        columns: { attributeValueId: true },
        orderBy: [asc(productAttributeValue.attributeValueId)],
      },
      images: {
        columns: { height: true, id: true, url: true, width: true },
        orderBy: [asc(productImage.position), asc(productImage.id)],
      },
      store: { columns: { currencyCode: true } },
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
    throw notFound();
  }

  const { attributeValues, images, store: owner, translations, ...row } = found;
  // In the languages' own order, Spanish first, whatever order they came in.
  const texts = LOCALES.flatMap((locale) =>
    translations.filter((text) => text.locale === locale)
  );

  return {
    ...row,
    attributeValueIds: attributeValues.map((pair) => pair.attributeValueId),
    currencyCode: owner.currencyCode,
    images,
    publishGaps: resolvePublishGaps({
      categoryId: row.categoryId,
      imageCount: images.length,
      priceAmount: row.priceAmount,
      translations: texts,
    }),
    translations: texts,
  };
}

export type StoreProduct = Awaited<ReturnType<typeof getStoreProduct>>;

/** The page's language first, then the others in their order. */
function languagesFrom(locale: Locale): Locale[] {
  return [locale, ...LOCALES.filter((other) => other !== locale)];
}

/**
 * The text that names an article in the admin's list: its title in the
 * page's language, else in another language, else none (a blank draft).
 * The list's title sort reads the same (`titleKey`).
 */
function listTitle(
  translations: readonly { locale: Locale; title: string }[],
  locale: Locale
): { lang: Locale; title: string } | null {
  for (const language of languagesFrom(locale)) {
    const text = translations.find(
      (row) => row.locale === language && row.title.trim() !== ""
    );

    if (text) {
      return { lang: text.locale, title: text.title };
    }
  }

  return null;
}

/**
 * Whether one of the article's titles, in any language, holds `search`,
 * blind to case and accents ("nandu" finds "Ñandú"), its wildcards taken
 * literally: the storefront search's rule (`catalog.ts`), on titles only.
 */
function titleMatches(search: string): SQL {
  const text = alias(productTranslation, "searched");
  const fromText = sql`${productTranslation} as ${sql.identifier("searched")}`;

  return sql`exists (select 1 from ${fromText} where ${and(
    eq(text.productId, product.id),
    sql`unaccent(${text.title}) ilike unaccent(${likePattern(search)})`
  )})`;
}

/**
 * The first non-blank of a text in `locales`' order, each language's read by
 * `read`: what the list shows, lowercased and without accents, so "Ñandú"
 * sorts with the n's and "anillo" with "Aros".
 */
function textKey(
  locales: readonly Locale[],
  read: (language: Locale) => SQL
): SQL {
  return sql`lower(unaccent(coalesce(${sql.join(
    locales.map((language) => sql`(${read(language)})`),
    sql`, `
  )})))`;
}

/** The title the row shows (`listTitle`), as a sort key. */
function titleKey(locale: Locale): SQL {
  const text = alias(productTranslation, "titled");
  const fromText = sql`${productTranslation} as ${sql.identifier("titled")}`;

  return textKey(
    languagesFrom(locale),
    (language) =>
      sql`select nullif(btrim(${text.title}), '') from ${fromText} where ${and(
        eq(text.productId, product.id),
        eq(text.locale, language)
      )}`
  );
}

/**
 * The category's name the row shows, as a sort key: in the page's
 * language, else the Spanish one (`nameIn` in `product-list-row`).
 */
function categoryKey(locale: Locale): SQL {
  const name = alias(categoryTranslation, "named");
  const fromName = sql`${categoryTranslation} as ${sql.identifier("named")}`;

  return textKey(
    locale === "es" ? ["es"] : [locale, "es"],
    (language) =>
      sql`select nullif(btrim(${name.name}), '') from ${fromName} where ${and(
        eq(name.categoryId, product.categoryId),
        eq(name.locale, language)
      )}`
  );
}

/**
 * The admin list's order (FER-019): the column's key in `dir`, then the id
 * the same way, so the order is total and a page never repeats or skips a
 * row. An article without the key (no title, no category, no price) comes
 * last whichever the direction: the gaps gather at the end.
 */
function listOrder(
  sort: StoreProductSort,
  dir: SortDirection,
  locale: Locale
): SQL[] {
  const by = dir === "asc" ? asc : desc;
  const direction = dir === "asc" ? sql`asc` : sql`desc`;
  const last = (key: SQL | PgColumn) => sql`${key} ${direction} nulls last`;
  const keys: Record<StoreProductSort, SQL> = {
    category: last(categoryKey(locale)),
    price: last(product.priceAmount),
    status: by(product.status),
    title: last(titleKey(locale)),
    updated: by(product.updatedAt),
  };

  return [keys[sort], by(product.id)];
}

/**
 * The store's categories `slugs` names, a group standing for itself and the
 * categories in it (FER-043). A slug the store does not have names none.
 */
async function resolveCategoryIds(
  db: DatabaseClient,
  { slugs, storeId }: StoreScope & { slugs: readonly string[] }
): Promise<number[]> {
  if (slugs.length === 0) {
    return [];
  }

  const group = alias(category, "category_group");
  const rows = await db
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.storeId, storeId),
        or(
          inArray(category.slug, [...slugs]),
          inArray(
            category.parentId,
            db
              .select({ id: group.id })
              .from(group)
              .where(
                and(eq(group.storeId, storeId), inArray(group.slug, [...slugs]))
              )
          )
        )
      )
    );

  return rows.map((row) => row.id);
}

/** What narrows the admin's list, its slugs already resolved to ids. */
interface ListNarrowing extends Pick<
  ListStoreProductsValues,
  "availability" | "q" | "status"
> {
  /** Empty: no category narrows it (none asked, or none the store has). */
  categoryIds: readonly number[];
  /** One group of value ids per filter (`resolveCatalogFilters`). */
  valueGroups: readonly number[][];
}

/** The rows of the store the narrowing keeps. */
function listWhere(
  storeId: number,
  { availability, categoryIds, q, status, valueGroups }: ListNarrowing
) {
  return and(
    eq(product.storeId, storeId),
    status === undefined ? undefined : eq(product.status, status),
    availability === undefined
      ? undefined
      : eq(product.isAvailable, availability === "available"),
    categoryIds.length === 0
      ? undefined
      : inArray(product.categoryId, [...categoryIds]),
    q === undefined ? undefined : titleMatches(q),
    ...valueGroups.map((group) => carriesOneOf(group))
  );
}

/**
 * One numbered page of the store's articles for the admin's list (FER-017,
 * FER-019), drafts and published: searched by title, narrowed by status,
 * availability, categories and the store's filters, in a column's order
 * (`listOrder`), with how many match (counted up to
 * `STORE_PRODUCTS_COUNT_CAP`, `totalCapped` past it) and how many pages
 * that makes. A page past the last answers no rows and the same total, so
 * the screen can say so; past the cap the last is `ceil(cap / limit)`. Each
 * article with its cover (its first photo), the title that names it in
 * `locale`, its price, status, availability and category; the prices are in
 * the store's currency, answered beside them.
 * One snapshot, so the count, the page and its rows agree.
 */
export async function listStoreProducts(
  db: DatabaseClient,
  {
    availability,
    categories = [],
    dir,
    filters = [],
    limit,
    locale,
    page,
    q,
    sort,
    status,
    storeId,
  }: StoreScope &
    Omit<ListStoreProductsValues, "categories" | "filters"> &
    Partial<Pick<ListStoreProductsValues, "categories" | "filters">>
) {
  return await db.transaction(
    async (tx) => {
      const currencyCode = await storeCurrency(tx, storeId);
      const categoryIds = await resolveCategoryIds(tx, {
        slugs: categories,
        storeId,
      });
      const valueGroups = await resolveCatalogFilters(tx, {
        filters,
        storeId,
      });
      // Asked for categories the store has none of: ignored, like an
      // unknown filter value, rather than narrowing the list to nothing.
      const where = listWhere(storeId, {
        availability,
        categoryIds,
        q,
        status,
        valueGroups,
      });
      const matching = tx
        .select({ id: product.id })
        .from(product)
        .where(where)
        .limit(STORE_PRODUCTS_COUNT_CAP + 1)
        .as("matching");
      const [counted] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(matching);
      // The pages end where the count does: past `ceil(cap / limit)` the
      // foot has no page to name, so that page is past the end and reads
      // nothing, even with more matches beyond the cap.
      const pastTheCap = page > Math.ceil(STORE_PRODUCTS_COUNT_CAP / limit);
      const ids = pastTheCap
        ? []
        : (
            await tx
              .select({ id: product.id })
              .from(product)
              .where(where)
              .orderBy(
                ...listOrder(
                  sort,
                  dir ?? STORE_PRODUCT_SORT_DIRECTIONS[sort],
                  locale
                )
              )
              .limit(limit)
              .offset((page - 1) * limit)
          ).map((row) => row.id);
      const rows =
        ids.length === 0
          ? []
          : await tx.query.product.findMany({
              columns: {
                id: true,
                isAvailable: true,
                priceAmount: true,
                slug: true,
                status: true,
                updatedAt: true,
              },
              where: inArray(product.id, ids),
              with: {
                category: {
                  columns: { id: true },
                  with: {
                    translations: { columns: { locale: true, name: true } },
                  },
                },
                images: {
                  columns: { height: true, url: true, width: true },
                  limit: 1,
                  orderBy: [asc(productImage.position), asc(productImage.id)],
                },
                translations: { columns: { locale: true, title: true } },
              },
            });
      // The page's order is the ids' (the read by id has none of its own).
      const byId = new Map(rows.map((row) => [row.id, row]));
      // `count(*)` always answers its one row.
      const counting = counted?.total ?? 0;
      const total = Math.min(counting, STORE_PRODUCTS_COUNT_CAP);

      return {
        currencyCode,
        items: ids.flatMap((id) => {
          const found = byId.get(id);

          if (!found) {
            return [];
          }

          const { category: inCategory, images, translations, ...row } = found;
          const named = listTitle(translations, locale);
          const nameOf = (language: Locale) =>
            inCategory?.translations.find((text) => text.locale === language)
              ?.name;

          return [
            {
              ...row,
              category: inCategory
                ? {
                    id: inCategory.id,
                    nameEn: nameOf("en") ?? null,
                    nameEs: nameOf("es") ?? "",
                  }
                : null,
              cover: images[0] ?? null,
              title: named?.title ?? null,
              titleLang: named?.lang ?? null,
            },
          ];
        }),
        limit,
        page,
        pageCount: Math.ceil(total / limit),
        total,
        totalCapped: counting > STORE_PRODUCTS_COUNT_CAP,
      };
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
}
