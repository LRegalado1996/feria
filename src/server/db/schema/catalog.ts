import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { CATALOG_SLUG_PATTERN, PRODUCT_STATUSES } from "@/lib/schemas/catalog";

import { localeEnum } from "./locale";
import { store } from "./store";

const timestamps = {
  createdAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
};

// A CHECK takes no bound parameters: the pattern is written into the SQL as
// a literal, from the module the zod schemas read, and holds no quote.
const slugPattern = sql.raw(`'${CATALOG_SLUG_PATTERN.source}'`);

export const productStatusEnum = pgEnum("product_status", PRODUCT_STATUSES);

/**
 * A store's category (FER-010). Its slug is the catalog's `?category=` value,
 * unique within the store; `position` orders the home's sliders and the
 * catalog's filter (FER-016).
 */
export const category = pgTable(
  "category",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    slug: text().notNull(),
    position: integer().notNull(),
    ...timestamps,
  },
  // The pair's unique index leads with `storeId`, so it also serves that
  // foreign key.
  (table) => [
    unique().on(table.storeId, table.slug),
    // The target of the article's (store, category) key: a category of
    // another store cannot be attached, whatever the code above asks.
    unique("category_store_id_unique").on(table.storeId, table.id),
    check("category_slug_format", sql`${table.slug} ~ ${slugPattern}`),
  ]
);

export const categoryTranslation = pgTable(
  "category_translation",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    categoryId: integer()
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    locale: localeEnum().notNull(),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [unique().on(table.categoryId, table.locale)]
);

/**
 * An article ("artículo" on screen). A draft may lack its category and its
 * price while it is being loaded; publishing requires both, an image and a
 * Spanish title (`resolvePublishGaps`). The price is an integer in minor units
 * of the store's currency. The slug comes from the Spanish title and stops
 * following it once the article was first published (`publishedAt` set), so
 * a shared link keeps working.
 */
export const product = pgTable(
  "product",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    // References the category together with `storeId` (below), so it is
    // always a category of the same store.
    categoryId: integer(),
    slug: text().notNull(),
    priceAmount: integer(),
    status: productStatusEnum().notNull().default("draft"),
    isAvailable: boolean().notNull().default(true),
    publishedAt: timestamp({
      mode: "date",
      withTimezone: true,
      precision: 3,
    }),
    ...timestamps,
  },
  (table) => [
    unique().on(table.storeId, table.slug),
    // A category with articles is deleted only after its articles move to
    // another one (FER-016), so none is ever left without one. NO ACTION, not
    // RESTRICT: checked at the end of the statement, so deleting the store
    // still cascades through its articles and categories together.
    foreignKey({
      columns: [table.storeId, table.categoryId],
      foreignColumns: [category.storeId, category.id],
      name: "product_store_category_fk",
    }).onDelete("no action"),
    index().on(table.storeId, table.categoryId),
    // The public list: a store's published articles, newest first, with the
    // id breaking ties (the keyset cursor carries both).
    index("product_public_list_index").on(
      table.storeId,
      table.status,
      // NULLS FIRST, Postgres's default for DESC and what the query's
      // `desc()` asks for, so the index serves the order and the LIMIT.
      table.publishedAt.desc().nullsFirst(),
      table.id.desc().nullsFirst()
    ),
    check("product_slug_format", sql`${table.slug} ~ ${slugPattern}`),
    check(
      "product_price_not_negative",
      sql`${table.priceAmount} IS NULL OR ${table.priceAmount} >= 0`
    ),
    check(
      "product_published_complete",
      sql`${table.status} <> 'published' OR (${table.categoryId} IS NOT NULL AND ${table.priceAmount} IS NOT NULL AND ${table.publishedAt} IS NOT NULL)`
    ),
  ]
);

export const productTranslation = pgTable(
  "product_translation",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    productId: integer()
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    locale: localeEnum().notNull(),
    title: text().notNull(),
    description: text().notNull(),
    seoTitle: text(),
    seoDescription: text(),
    ...timestamps,
  },
  (table) => [unique().on(table.productId, table.locale)]
);

/** An article's photo. The first by `position` is the cover. */
export const productImage = pgTable(
  "product_image",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    productId: integer()
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    url: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    position: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    index().on(table.productId, table.position),
    check(
      "product_image_size_positive",
      sql`${table.width} > 0 AND ${table.height} > 0`
    ),
  ]
);

export const productImageTranslation = pgTable(
  "product_image_translation",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    productImageId: integer()
      .notNull()
      .references(() => productImage.id, { onDelete: "cascade" }),
    locale: localeEnum().notNull(),
    altText: text().notNull(),
    ...timestamps,
  },
  (table) => [unique().on(table.productImageId, table.locale)]
);
