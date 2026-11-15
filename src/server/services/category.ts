import { ORPCError } from "@orpc/server";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";

import type { CreateCategoryValues } from "@/lib/schemas/catalog";
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
      id: category.id,
      position: category.position,
      productCount: count(product.id),
      slug: category.slug,
    })
    .from(category)
    .leftJoin(product, eq(product.categoryId, category.id))
    .where(eq(category.storeId, storeId))
    .groupBy(category.id)
    .orderBy(asc(category.position), asc(category.id));
  const names =
    rows.length === 0
      ? []
      : await db
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
  const nameOf = (categoryId: number, locale: "en" | "es") =>
    names.find(
      (name) => name.categoryId === categoryId && name.locale === locale
    )?.name;

  return rows.map((row) => ({
    ...row,
    nameEn: nameOf(row.id, "en") ?? null,
    nameEs: nameOf(row.id, "es") ?? "",
  }));
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
  const slug = firstFreeSlug(
    slugify(values.nameEs, CATEGORY_SLUG_FALLBACK),
    new Set(existing.map((row) => row.slug))
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

/** Replaces a category's names; its slug and place stay. */
export async function renameCategory(
  tx: DatabaseClient,
  { id, storeId, values }: StoreScope & { id: number; values: CategoryNames }
) {
  await lockStoreCategories(tx, storeId);
  const found = await findStoreCategory(tx, { id, lock: "update", storeId });
  await assertNameFree(tx, { excludeId: id, nameEs: values.nameEs, storeId });

  await tx
    .delete(categoryTranslation)
    .where(eq(categoryTranslation.categoryId, found.id));
  await tx
    .insert(categoryTranslation)
    .values(toTranslationRows(found.id, values));

  return found;
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
