import { ORPCError } from "@orpc/server";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";

import { imageOf } from "@/lib/catalog/cover";
import {
  type CreateCategoryValues,
  RESERVED_CATEGORY_SLUGS,
  type UpdateCategoryPageValues,
} from "@/lib/schemas/catalog";
import { firstFreeSlug, slugify } from "@/lib/utils/slugify";
import type { DatabaseClient } from "@/server/db";
import { category, categoryTranslation, product } from "@/server/db/schema";

/** What names a category whose Spanish name has nothing readable in it. */
const CATEGORY_SLUG_FALLBACK = "categoria";

interface StoreScope {
  storeId: number;
}

type CategoryNames = Pick<CreateCategoryValues, "nameEn" | "nameEs">;

function notFound() {
  return new ORPCError("NOT_FOUND", { message: "Category not found" });
}

/**
 * A store's categories in their order, each with its names (English `null`
 * when it has none) and how many of the store's articles it holds, drafts
 * included: what the admin screen shows (FER-016).
 */
export async function listStoreCategories(
  db: DatabaseClient,
  { storeId }: StoreScope
) {
  // One statement, so the counts and the list come from the same snapshot.
  // A join, not a correlated subquery: Drizzle leaves a single table's
  // columns unqualified, and inside a subquery "id" would be the product's.
  const rows = await db
    .select({
      coverHeight: category.coverHeight,
      coverPhoneHeight: category.coverPhoneHeight,
      coverPhoneUrl: category.coverPhoneUrl,
      coverPhoneWidth: category.coverPhoneWidth,
      coverUrl: category.coverUrl,
      coverWidth: category.coverWidth,
      id: category.id,
      parentId: category.parentId,
      position: category.position,
      productCount: count(product.id),
      slug: category.slug,
    })
    .from(category)
    .leftJoin(product, eq(product.categoryId, category.id))
    .where(eq(category.storeId, storeId))
    .groupBy(category.id)
    .orderBy(asc(category.position), asc(category.id));
  const texts =
    rows.length === 0
      ? []
      : await db
          .select({
            categoryId: categoryTranslation.categoryId,
            coverAlt: categoryTranslation.coverAlt,
            locale: categoryTranslation.locale,
            name: categoryTranslation.name,
            seoDescription: categoryTranslation.seoDescription,
            seoTitle: categoryTranslation.seoTitle,
          })
          .from(categoryTranslation)
          .where(
            inArray(
              categoryTranslation.categoryId,
              rows.map((row) => row.id)
            )
          );
  const textOf = (categoryId: number, locale: "en" | "es") =>
    texts.find(
      (text) => text.categoryId === categoryId && text.locale === locale
    );

  return rows.map(
    ({
      coverHeight,
      coverPhoneHeight,
      coverPhoneUrl,
      coverPhoneWidth,
      coverUrl,
      coverWidth,
      ...row
    }) => {
      const es = textOf(row.id, "es");
      const en = textOf(row.id, "en");

      return {
        ...row,
        cover: {
          computer: imageOf(coverUrl, coverWidth, coverHeight),
          phone: imageOf(coverPhoneUrl, coverPhoneWidth, coverPhoneHeight),
        },
        coverAltEn: en?.coverAlt ?? null,
        coverAltEs: es?.coverAlt ?? null,
        nameEn: en?.name ?? null,
        nameEs: es?.name ?? "",
        seoDescriptionEn: en?.seoDescription ?? null,
        seoDescriptionEs: es?.seoDescription ?? null,
        seoTitleEn: en?.seoTitle ?? null,
        seoTitleEs: es?.seoTitle ?? null,
      };
    }
  );
}
export type StoreCategory = Awaited<
  ReturnType<typeof listStoreCategories>
>[number];

/**
 * Every write to a store's categories takes this lock first, held to the end
 * of its transaction: the duplicate-name check, the slug and the next
 * position are then decided by one writer at a time.
 */
async function lockStoreCategories(tx: DatabaseClient, storeId: number) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`category:${storeId}`}))`
  );
}

/**
 * Refuses a Spanish name another category of the store already has, ignoring
 * case and accents ("Cadenas" and "cadenas" are the same category to a
 * shopper). The message names the field the admin shows it under.
 */
async function assertNameFree(
  tx: DatabaseClient,
  {
    excludeId,
    nameEs,
    storeId,
  }: StoreScope & { excludeId: number | null; nameEs: string }
) {
  const [taken] = await tx
    .select({ id: category.id })
    .from(categoryTranslation)
    .innerJoin(category, eq(category.id, categoryTranslation.categoryId))
    .where(
      and(
        eq(category.storeId, storeId),
        eq(categoryTranslation.locale, "es"),
        sql`lower(unaccent(${categoryTranslation.name})) = lower(unaccent(${nameEs}))`,
        excludeId === null ? undefined : ne(category.id, excludeId)
      )
    )
    .limit(1);

  if (taken) {
    throw new ORPCError("CONFLICT", {
      message: "Another category of this store already has that name",
    });
  }
}

function toTranslationRows(categoryId: number, names: CategoryNames) {
  return [
    { categoryId, locale: "es" as const, name: names.nameEs },
    ...(names.nameEn === null
      ? []
      : [{ categoryId, locale: "en" as const, name: names.nameEn }]),
  ];
}

/**
 * A new category at the end of the store's list. Its slug comes from the
 * Spanish name and never changes afterwards: catalog links shared by
 * WhatsApp carry it (`?category=collares`).
 */
export async function createCategory(
  tx: DatabaseClient,
  { storeId, values }: StoreScope & { values: CategoryNames }
) {
  await lockStoreCategories(tx, storeId);
  await assertNameFree(tx, { excludeId: null, nameEs: values.nameEs, storeId });

  const existing = await tx
    .select({ position: category.position, slug: category.slug })
    .from(category)
    .where(eq(category.storeId, storeId));
  // A slug is a page's address (FER-043): never one the site already has.
  const slug = firstFreeSlug(
    slugify(values.nameEs, CATEGORY_SLUG_FALLBACK),
    new Set([...RESERVED_CATEGORY_SLUGS, ...existing.map((row) => row.slug)])
  );
  // Under the lock, so two creations never take the same place.
  const position = Math.max(-1, ...existing.map((row) => row.position)) + 1;

  const [created] = await tx
    .insert(category)
    .values({ position, slug, storeId })
    .returning({
      id: category.id,
      position: category.position,
      slug: category.slug,
    });

  if (!created) {
    throw new Error("Inserting a category returned no row");
  }

  await tx
    .insert(categoryTranslation)
    .values(toTranslationRows(created.id, values));

  return created;
}

/**
 * The store's category, or NOT_FOUND: an id from input is not trusted. Its
 * row is locked for the rest of the transaction: `update` for the one being
 * deleted, `share` for one articles move into, against an article write
 * attaching to it at the same time (it locks the row `share` too).
 */
async function findStoreCategory(
  tx: DatabaseClient,
  { id, lock, storeId }: StoreScope & { id: number; lock: "share" | "update" }
) {
  const [found] = await tx
    .select({ id: category.id, slug: category.slug })
    .from(category)
    .where(and(eq(category.id, id), eq(category.storeId, storeId)))
    .for(lock);

  if (!found) {
    throw notFound();
  }

  return found;
}

/**
 * Replaces a category's names; its slug, its place and its page's texts
 * stay. Without an English name its English row goes, its English page
 * texts with it: they described a name it no longer has.
 */
export async function renameCategory(
  tx: DatabaseClient,
  { id, storeId, values }: StoreScope & { id: number; values: CategoryNames }
) {
  await lockStoreCategories(tx, storeId);
  const found = await findStoreCategory(tx, { id, lock: "update", storeId });
  await assertNameFree(tx, { excludeId: id, nameEs: values.nameEs, storeId });

  if (values.nameEn === null) {
    await tx
      .delete(categoryTranslation)
      .where(
        and(
          eq(categoryTranslation.categoryId, found.id),
          eq(categoryTranslation.locale, "en")
        )
      );
  }

  await tx
    .insert(categoryTranslation)
    .values(toTranslationRows(found.id, values))
    .onConflictDoUpdate({
      set: { name: sql`excluded."name"`, updatedAt: sql`excluded."updatedAt"` },
      target: [categoryTranslation.categoryId, categoryTranslation.locale],
    });

  return found;
}

/**
 * Sets a category's page (FER-043): the group it belongs to, and its texts
 * for search engines and its cover's alt text in both languages. A group is
 * another category of the store that is in no group itself, and a category
 * that is a group joins none: one level only, decided under the store's
 * category lock, so two admins cannot nest two categories into each other at
 * once. English texts need the English name's row: without an English name
 * there is no English page text to keep.
 */
export async function updateCategoryPage(
  tx: DatabaseClient,
  { storeId, values }: StoreScope & { values: UpdateCategoryPageValues }
) {
  await lockStoreCategories(tx, storeId);
  const found = await findStoreCategory(tx, {
    id: values.id,
    lock: "update",
    storeId,
  });

  if (values.parentId !== null) {
    await assertCanJoin(tx, {
      id: found.id,
      parentId: values.parentId,
      storeId,
    });
  }

  const english = [
    values.seoTitleEn,
    values.seoDescriptionEn,
    values.coverAltEn,
  ].some((text) => text !== null);
  const [hasEnglish] = await tx
    .select({ id: categoryTranslation.id })
    .from(categoryTranslation)
    .where(
      and(
        eq(categoryTranslation.categoryId, found.id),
        eq(categoryTranslation.locale, "en")
      )
    );

  if (english && !hasEnglish) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Name the category in English before its English page texts",
    });
  }

  await tx
    .update(category)
    .set({ parentId: values.parentId })
    .where(and(eq(category.id, found.id), eq(category.storeId, storeId)));

  for (const locale of ["es", "en"] as const) {
    const own =
      locale === "es"
        ? {
            coverAlt: values.coverAltEs,
            seoDescription: values.seoDescriptionEs,
            seoTitle: values.seoTitleEs,
          }
        : {
            coverAlt: values.coverAltEn,
            seoDescription: values.seoDescriptionEn,
            seoTitle: values.seoTitleEn,
          };

    await tx
      .update(categoryTranslation)
      .set(own)
      .where(
        and(
          eq(categoryTranslation.categoryId, found.id),
          eq(categoryTranslation.locale, locale)
        )
      );
  }

  return { id: found.id, parentId: values.parentId };
}

/**
 * Refuses a group the category cannot join: itself, a category of another
 * store or none (NOT_FOUND, as for the category), a category that is in a
 * group already, or any group while the category holds categories itself.
 */
async function assertCanJoin(
  tx: DatabaseClient,
  { id, parentId, storeId }: StoreScope & { id: number; parentId: number }
) {
  if (parentId === id) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A category cannot be its own group",
    });
  }

  const [group] = await tx
    .select({ id: category.id, parentId: category.parentId })
    .from(category)
    .where(and(eq(category.id, parentId), eq(category.storeId, storeId)))
    .for("share");

  if (!group) {
    throw new ORPCError("NOT_FOUND", { message: "Group not found" });
  }

  if (group.parentId !== null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A category in a group cannot be a group",
    });
  }

  const [child] = await tx
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.storeId, storeId), eq(category.parentId, id)))
    .limit(1);

  if (child) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A group cannot join another group",
    });
  }
}

/**
 * Puts the store's categories in the order given, which must name each of
 * them exactly once: a partial list is refused, never applied in part. One
 * UPDATE for all of them. The order is the home's sliders and the catalog's
 * filter (FER-016).
 */
export async function reorderCategories(
  tx: DatabaseClient,
  { ids, storeId }: StoreScope & { ids: number[] }
) {
  await lockStoreCategories(tx, storeId);
  const rows = await tx
    .select({ id: category.id })
    .from(category)
    .where(eq(category.storeId, storeId));
  const own = new Set(rows.map((row) => row.id));

  if (
    ids.length !== own.size ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !own.has(id))
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Give every category of the store, once each",
    });
  }

  const positions = sql.join(
    ids.map((id, index) => sql`when ${id} then ${index}::int`),
    sql` `
  );

  await tx
    .update(category)
    .set({ position: sql`case ${category.id} ${positions} end` })
    .where(and(eq(category.storeId, storeId), inArray(category.id, ids)));

  return { ids };
}

/**
 * Deletes a category. When it still has articles they move first to
 * `moveToId`, another category of the same store, so none is ever left
 * without one; without articles `moveToId` is ignored.
 */
export async function deleteCategory(
  tx: DatabaseClient,
  {
    id,
    moveToId,
    storeId,
  }: StoreScope & { id: number; moveToId: number | null }
) {
  await lockStoreCategories(tx, storeId);
  // Locked first: an article written into it meanwhile waits for the
  // deletion, then finds the category gone instead of a foreign-key error.
  await findStoreCategory(tx, { id, lock: "update", storeId });
  // A group's categories stay, out of any group: their articles are theirs.
  await tx
    .update(category)
    .set({ parentId: null })
    .where(and(eq(category.storeId, storeId), eq(category.parentId, id)));

  const [held] = await tx
    .select({ total: count() })
    .from(product)
    .where(and(eq(product.storeId, storeId), eq(product.categoryId, id)));
  const articles = held?.total ?? 0;

  if (articles > 0) {
    if (moveToId === null) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Choose where its articles move before deleting it",
      });
    }

    if (moveToId === id) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Choose another category for its articles",
      });
    }

    await findStoreCategory(tx, { id: moveToId, lock: "share", storeId });
    // Its articles locked in id order before the bulk update, which locks
    // them in scan order: an order (FER-025) share-locks articles in id
    // order too, so neither can hold one the other waits for.
    await tx
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.storeId, storeId), eq(product.categoryId, id)))
      .orderBy(asc(product.id))
      .for("update");
    const moved = await tx
      .update(product)
      .set({ categoryId: moveToId })
      .where(and(eq(product.storeId, storeId), eq(product.categoryId, id)))
      .returning({ id: product.id });

    await tx
      .delete(category)
      .where(and(eq(category.id, id), eq(category.storeId, storeId)));

    return { id, movedArticles: moved.length };
  }

  await tx
    .delete(category)
    .where(and(eq(category.id, id), eq(category.storeId, storeId)));

  return { id, movedArticles: 0 };
}
