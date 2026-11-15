import { ORPCError } from "@orpc/server";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";

import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import {
  type AttributeNames,
  type CatalogFilters,
  RESERVED_ATTRIBUTE_SLUGS,
} from "@/lib/schemas/catalog";
import { firstFreeSlug, slugify } from "@/lib/utils/slugify";
import type { DatabaseClient } from "@/server/db";
import {
  attribute,
  attributeTranslation,
  attributeValue,
  attributeValueTranslation,
  product,
  productAttributeValue,
} from "@/server/db/schema";

interface StoreScope {
  storeId: number;
}

const ATTRIBUTE_SLUG_FALLBACK = "filtro";
const VALUE_SLUG_FALLBACK = "valor";

function attributeNotFound() {
  return new ORPCError("NOT_FOUND", { message: "Filter not found" });
}

function valueNotFound() {
  return new ORPCError("NOT_FOUND", { message: "Filter value not found" });
}

function nameTaken() {
  return new ORPCError("CONFLICT", {
    message: "That name is already in use here",
  });
}

function attributeNameRows(attributeId: number, names: AttributeNames) {
  return [
    { attributeId, locale: "es" as const, name: names.nameEs },
    ...(names.nameEn === null
      ? []
      : [{ attributeId, locale: "en" as const, name: names.nameEn }]),
  ];
}

function valueNameRows(attributeValueId: number, names: AttributeNames) {
  return [
    { attributeValueId, locale: "es" as const, name: names.nameEs },
    ...(names.nameEn === null
      ? []
      : [{ attributeValueId, locale: "en" as const, name: names.nameEn }]),
  ];
}

/** The rows' names by id and locale, read in one query. */
function namesById(rows: { locale: Locale; name: string; ownerId: number }[]) {
  return (id: number, locale: Locale) =>
    rows.find((row) => row.ownerId === id && row.locale === locale)?.name;
}

// ── Store-scoped ─────────────────────────────────────────────────────────

/**
 * A store's filters in their order, each with its values in theirs, names in
 * both languages (English `null` when missing), swatches and how many of the
 * store's articles carry each value, drafts included (FER-033's admin).
 */
export async function listStoreAttributes(
  db: DatabaseClient,
  { storeId }: StoreScope
) {
  const attributes = await db
    .select({
      id: attribute.id,
      position: attribute.position,
      slug: attribute.slug,
    })
    .from(attribute)
    .where(eq(attribute.storeId, storeId))
    .orderBy(asc(attribute.position), asc(attribute.id));

  if (attributes.length === 0) {
    return [];
  }

  const attributeIds = attributes.map((row) => row.id);
  const values = await db
    .select({
      attributeId: attributeValue.attributeId,
      id: attributeValue.id,
      position: attributeValue.position,
      productCount: count(productAttributeValue.id),
      slug: attributeValue.slug,
      swatchColor: attributeValue.swatchColor,
    })
    .from(attributeValue)
    .leftJoin(
      productAttributeValue,
      eq(productAttributeValue.attributeValueId, attributeValue.id)
    )
    .where(inArray(attributeValue.attributeId, attributeIds))
    .groupBy(attributeValue.id)
    .orderBy(asc(attributeValue.position), asc(attributeValue.id));
  const attributeName = namesById(
    await db
      .select({
        locale: attributeTranslation.locale,
        name: attributeTranslation.name,
        ownerId: attributeTranslation.attributeId,
      })
      .from(attributeTranslation)
      .where(inArray(attributeTranslation.attributeId, attributeIds))
  );
  const valueIds = values.map((row) => row.id);
  const valueName = namesById(
    valueIds.length === 0
      ? []
      : await db
          .select({
            locale: attributeValueTranslation.locale,
            name: attributeValueTranslation.name,
            ownerId: attributeValueTranslation.attributeValueId,
          })
          .from(attributeValueTranslation)
          .where(inArray(attributeValueTranslation.attributeValueId, valueIds))
  );

  return attributes.map((row) => ({
    ...row,
    nameEn: attributeName(row.id, "en") ?? null,
    nameEs: attributeName(row.id, "es") ?? "",
    values: values
      .filter((value) => value.attributeId === row.id)
      .map(({ attributeId: _attributeId, ...value }) => ({
        ...value,
        nameEn: valueName(value.id, "en") ?? null,
        nameEs: valueName(value.id, "es") ?? "",
      })),
  }));
}

export type StoreAttribute = Awaited<
  ReturnType<typeof listStoreAttributes>
>[number];

/**
 * Every write to a store's filters and their values takes this lock first,
 * held to the end of its transaction: names, slugs and positions are decided
 * by one writer at a time.
 */
async function lockStoreAttributes(tx: DatabaseClient, storeId: number) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`attribute:${storeId}`}))`
  );
}

/** The store's filter, locked `update`, or NOT_FOUND. */
async function findStoreAttribute(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  const [found] = await tx
    .select({ id: attribute.id, slug: attribute.slug })
    .from(attribute)
    .where(and(eq(attribute.id, id), eq(attribute.storeId, storeId)))
    .for("update");

  if (!found) {
    throw attributeNotFound();
  }

  return found;
}

/** A value of one of the store's filters, locked `update`, or NOT_FOUND. */
async function findStoreValue(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  const [found] = await tx
    .select({ attributeId: attributeValue.attributeId, id: attributeValue.id })
    .from(attributeValue)
    .innerJoin(attribute, eq(attribute.id, attributeValue.attributeId))
    .where(and(eq(attributeValue.id, id), eq(attribute.storeId, storeId)))
    .for("update", { of: attributeValue });

  if (!found) {
    throw valueNotFound();
  }

  return found;
}

/** Refuses a Spanish filter name the store already has (case, accents). */
async function assertAttributeNameFree(
  tx: DatabaseClient,
  {
    excludeId,
    nameEs,
    storeId,
  }: StoreScope & { excludeId: number | null; nameEs: string }
) {
  const [taken] = await tx
    .select({ id: attribute.id })
    .from(attributeTranslation)
    .innerJoin(attribute, eq(attribute.id, attributeTranslation.attributeId))
    .where(
      and(
        eq(attribute.storeId, storeId),
        eq(attributeTranslation.locale, "es"),
        sql`lower(unaccent(${attributeTranslation.name})) = lower(unaccent(${nameEs}))`,
        excludeId === null ? undefined : ne(attribute.id, excludeId)
      )
    )
    .limit(1);

  if (taken) {
    throw nameTaken();
  }
}

/** Refuses a Spanish value name its filter already has (case, accents). */
async function assertValueNameFree(
  tx: DatabaseClient,
  {
    attributeId,
    excludeId,
    nameEs,
  }: { attributeId: number; excludeId: number | null; nameEs: string }
) {
  const [taken] = await tx
    .select({ id: attributeValue.id })
    .from(attributeValueTranslation)
    .innerJoin(
      attributeValue,
      eq(attributeValue.id, attributeValueTranslation.attributeValueId)
    )
    .where(
      and(
        eq(attributeValue.attributeId, attributeId),
        eq(attributeValueTranslation.locale, "es"),
        sql`lower(unaccent(${attributeValueTranslation.name})) = lower(unaccent(${nameEs}))`,
        excludeId === null ? undefined : ne(attributeValue.id, excludeId)
      )
    )
    .limit(1);

  if (taken) {
    throw nameTaken();
  }
}

/**
 * A new filter at the end of the store's list. Its slug, the catalog's URL
 * parameter, comes from the Spanish name, skips the ones the catalog uses
 * (`category`, `q`…) and never changes afterwards.
 */
export async function createAttribute(
  tx: DatabaseClient,
  { storeId, values }: StoreScope & { values: AttributeNames }
) {
  await lockStoreAttributes(tx, storeId);
  await assertAttributeNameFree(tx, {
    excludeId: null,
    nameEs: values.nameEs,
    storeId,
  });

  const existing = await tx
    .select({ position: attribute.position, slug: attribute.slug })
    .from(attribute)
    .where(eq(attribute.storeId, storeId));
  const slug = firstFreeSlug(
    slugify(values.nameEs, ATTRIBUTE_SLUG_FALLBACK),
    new Set([...RESERVED_ATTRIBUTE_SLUGS, ...existing.map((row) => row.slug)])
  );
  const position = Math.max(-1, ...existing.map((row) => row.position)) + 1;
  const [created] = await tx
    .insert(attribute)
    .values({ position, slug, storeId })
    .returning({
      id: attribute.id,
      position: attribute.position,
      slug: attribute.slug,
    });

  if (!created) {
    throw new Error("Inserting a filter returned no row");
  }

  await tx
    .insert(attributeTranslation)
    .values(attributeNameRows(created.id, values));

  return created;
}

/** Replaces a filter's names; its slug and place stay. */
export async function renameAttribute(
  tx: DatabaseClient,
  { id, storeId, values }: StoreScope & { id: number; values: AttributeNames }
) {
  await lockStoreAttributes(tx, storeId);
  const found = await findStoreAttribute(tx, { id, storeId });
  await assertAttributeNameFree(tx, {
    excludeId: id,
    nameEs: values.nameEs,
    storeId,
  });

  await tx
    .delete(attributeTranslation)
    .where(eq(attributeTranslation.attributeId, found.id));
  await tx
    .insert(attributeTranslation)
    .values(attributeNameRows(found.id, values));

  return found;
}

/** Writes `ids`' positions in order in one UPDATE, after checking the set. */
function positionsCase(ids: number[]) {
  return sql.join(
    ids.map((id, index) => sql`when ${id} then ${index}::int`),
    sql` `
  );
}

function assertExactSet(ids: number[], own: Set<number>, message: string) {
  if (
    ids.length !== own.size ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !own.has(id))
  ) {
    throw new ORPCError("BAD_REQUEST", { message });
  }
}

/** Puts every filter of the store in the order given. */
export async function reorderAttributes(
  tx: DatabaseClient,
  { ids, storeId }: StoreScope & { ids: number[] }
) {
  await lockStoreAttributes(tx, storeId);
  const rows = await tx
    .select({ id: attribute.id })
    .from(attribute)
    .where(eq(attribute.storeId, storeId));
  assertExactSet(
    ids,
    new Set(rows.map((row) => row.id)),
    "Give every filter of the store, once each"
  );

  await tx
    .update(attribute)
    .set({ position: sql`case ${attribute.id} ${positionsCase(ids)} end` })
    .where(and(eq(attribute.storeId, storeId), inArray(attribute.id, ids)));

  return { ids };
}

/** Deletes a filter with its values, taking them off every article. */
export async function deleteAttribute(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  await lockStoreAttributes(tx, storeId);
  await findStoreAttribute(tx, { id, storeId });
  await tx
    .delete(attribute)
    .where(and(eq(attribute.id, id), eq(attribute.storeId, storeId)));

  return { id };
}

/** A new value at the end of one of the store's filters. */
export async function createAttributeValue(
  tx: DatabaseClient,
  {
    attributeId,
    storeId,
    swatchColor,
    values,
  }: StoreScope & {
    attributeId: number;
    swatchColor: string | null;
    values: AttributeNames;
  }
) {
  await lockStoreAttributes(tx, storeId);
  await findStoreAttribute(tx, { id: attributeId, storeId });
  await assertValueNameFree(tx, {
    attributeId,
    excludeId: null,
    nameEs: values.nameEs,
  });

  const existing = await tx
    .select({ position: attributeValue.position, slug: attributeValue.slug })
    .from(attributeValue)
    .where(eq(attributeValue.attributeId, attributeId));
  const slug = firstFreeSlug(
    slugify(values.nameEs, VALUE_SLUG_FALLBACK),
    new Set(existing.map((row) => row.slug))
  );
  const position = Math.max(-1, ...existing.map((row) => row.position)) + 1;
  const [created] = await tx
    .insert(attributeValue)
    .values({ attributeId, position, slug, swatchColor })
    .returning({
      id: attributeValue.id,
      position: attributeValue.position,
      slug: attributeValue.slug,
    });

  if (!created) {
    throw new Error("Inserting a filter value returned no row");
  }

  await tx
    .insert(attributeValueTranslation)
    .values(valueNameRows(created.id, values));

  return created;
}

/** Replaces a value's names and swatch; its slug and place stay. */
export async function updateAttributeValue(
  tx: DatabaseClient,
  {
    id,
    storeId,
    swatchColor,
    values,
  }: StoreScope & {
    id: number;
    swatchColor: string | null;
    values: AttributeNames;
  }
) {
  await lockStoreAttributes(tx, storeId);
  const found = await findStoreValue(tx, { id, storeId });
  await assertValueNameFree(tx, {
    attributeId: found.attributeId,
    excludeId: id,
    nameEs: values.nameEs,
  });

  await tx
    .update(attributeValue)
    .set({ swatchColor })
    .where(eq(attributeValue.id, found.id));
  await tx
    .delete(attributeValueTranslation)
    .where(eq(attributeValueTranslation.attributeValueId, found.id));
  await tx
    .insert(attributeValueTranslation)
    .values(valueNameRows(found.id, values));

  return { id: found.id };
}

/** Puts every value of one of the store's filters in the order given. */
export async function reorderAttributeValues(
  tx: DatabaseClient,
  {
    attributeId,
    ids,
    storeId,
  }: StoreScope & { attributeId: number; ids: number[] }
) {
  await lockStoreAttributes(tx, storeId);
  await findStoreAttribute(tx, { id: attributeId, storeId });
  const rows = await tx
    .select({ id: attributeValue.id })
    .from(attributeValue)
    .where(eq(attributeValue.attributeId, attributeId));
  assertExactSet(
    ids,
    new Set(rows.map((row) => row.id)),
    "Give every value of the filter, once each"
  );

  await tx
    .update(attributeValue)
    .set({ position: sql`case ${attributeValue.id} ${positionsCase(ids)} end` })
    .where(
      and(
        eq(attributeValue.attributeId, attributeId),
        inArray(attributeValue.id, ids)
      )
    );

  return { ids };
}

/**
 * Deletes a value, taking it off the articles that carried it (the admin
 * confirms first, FER-033); answers how many articles lost it.
 */
export async function deleteAttributeValue(
  tx: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  await lockStoreAttributes(tx, storeId);
  await findStoreValue(tx, { id, storeId });
  const removed = await tx
    .delete(productAttributeValue)
    .where(eq(productAttributeValue.attributeValueId, id))
    .returning({ id: productAttributeValue.id });
  await tx.delete(attributeValue).where(eq(attributeValue.id, id));

  return { id, removedFromArticles: removed.length };
}

/**
 * Replaces the values an article carries. The article and every value must
 * be the store's: a value of another store's filter is refused, never
 * attached.
 */
export async function setProductAttributeValues(
  tx: DatabaseClient,
  {
    productId,
    storeId,
    valueIds,
  }: StoreScope & { productId: number; valueIds: number[] }
) {
  const [article] = await tx
    .select({ id: product.id })
    .from(product)
    .where(and(eq(product.id, productId), eq(product.storeId, storeId)))
    .for("update");

  if (!article) {
    throw new ORPCError("NOT_FOUND", { message: "Article not found" });
  }

  if (valueIds.length > 0) {
    const own = await tx
      .select({ id: attributeValue.id })
      .from(attributeValue)
      .innerJoin(attribute, eq(attribute.id, attributeValue.attributeId))
      .where(
        and(
          eq(attribute.storeId, storeId),
          inArray(attributeValue.id, valueIds)
        )
      )
      .for("share", { of: attributeValue });

    if (own.length !== valueIds.length) {
      throw valueNotFound();
    }
  }

  await tx
    .delete(productAttributeValue)
    .where(eq(productAttributeValue.productId, article.id));

  if (valueIds.length > 0) {
    await tx.insert(productAttributeValue).values(
      valueIds.map((attributeValueId) => ({
        attributeValueId,
        productId: article.id,
      }))
    );
  }

  return { id: article.id, valueIds };
}

// ── Public ───────────────────────────────────────────────────────────────

/**
 * The filters the storefront offers (FER-033): each of the store's filters
 * in order with the values that at least one published article carries, and
 * how many; a value without one is not offered, nor a filter without values.
 * Names in `locale`, else the language they have.
 */
export async function listCatalogFilters(
  db: DatabaseClient,
  { locale, storeId }: StoreScope & { locale: Locale }
) {
  const values = await db
    .select({
      attributeId: attribute.id,
      attributePosition: attribute.position,
      attributeSlug: attribute.slug,
      count: count(product.id),
      id: attributeValue.id,
      position: attributeValue.position,
      slug: attributeValue.slug,
      swatchColor: attributeValue.swatchColor,
    })
    .from(attributeValue)
    .innerJoin(attribute, eq(attribute.id, attributeValue.attributeId))
    .innerJoin(
      productAttributeValue,
      eq(productAttributeValue.attributeValueId, attributeValue.id)
    )
    .innerJoin(
      product,
      and(
        eq(product.id, productAttributeValue.productId),
        eq(product.status, "published"),
        eq(product.storeId, storeId)
      )
    )
    .where(eq(attribute.storeId, storeId))
    .groupBy(attribute.id, attributeValue.id)
    .orderBy(
      asc(attribute.position),
      asc(attribute.id),
      asc(attributeValue.position),
      asc(attributeValue.id)
    );

  if (values.length === 0) {
    return [];
  }

  const attributeIds = [...new Set(values.map((row) => row.attributeId))];
  const [attributeNames, valueNames] = await Promise.all([
    db
      .select({
        locale: attributeTranslation.locale,
        name: attributeTranslation.name,
        ownerId: attributeTranslation.attributeId,
      })
      .from(attributeTranslation)
      .where(inArray(attributeTranslation.attributeId, attributeIds)),
    db
      .select({
        locale: attributeValueTranslation.locale,
        name: attributeValueTranslation.name,
        ownerId: attributeValueTranslation.attributeValueId,
      })
      .from(attributeValueTranslation)
      .where(
        inArray(
          attributeValueTranslation.attributeValueId,
          values.map((row) => row.id)
        )
      ),
  ]);
  const pick = (
    rows: { locale: Locale; name: string; ownerId: number }[],
    id: number
  ) =>
    pickTranslation(
      rows.filter((row) => row.ownerId === id),
      locale
    );

  return attributeIds.map((attributeId) => {
    const own = values.filter((row) => row.attributeId === attributeId);
    const name = pick(attributeNames, attributeId);

    return {
      lang: name?.locale ?? locale,
      name: name?.name ?? "",
      slug: own[0]?.attributeSlug ?? "",
      values: own.map((row) => {
        const valueName = pick(valueNames, row.id);

        return {
          count: row.count,
          lang: valueName?.locale ?? locale,
          name: valueName?.name ?? "",
          slug: row.slug,
          swatchColor: row.swatchColor,
        };
      }),
    };
  });
}

export type CatalogFilter = Awaited<
  ReturnType<typeof listCatalogFilters>
>[number];

/**
 * The value ids the catalog filters by, one group per known filter: what
 * the URL asked for, minus every filter or value the store does not have
 * (an old link never breaks, it just filters less).
 */
export async function resolveCatalogFilters(
  db: DatabaseClient,
  { filters, storeId }: StoreScope & { filters: CatalogFilters }
): Promise<number[][]> {
  if (filters.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      attributeSlug: attribute.slug,
      id: attributeValue.id,
      slug: attributeValue.slug,
    })
    .from(attributeValue)
    .innerJoin(attribute, eq(attribute.id, attributeValue.attributeId))
    .where(
      and(
        eq(attribute.storeId, storeId),
        inArray(
          attribute.slug,
          filters.map((filter) => filter.attribute)
        )
      )
    );

  return filters
    .map((filter) =>
      rows
        .filter(
          (row) =>
            row.attributeSlug === filter.attribute &&
            filter.values.includes(row.slug)
        )
        .map((row) => row.id)
    )
    .filter((group) => group.length > 0);
}
