import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import {
  CATALOG_SLUG_PATTERN,
  CATEGORY_SEO_DESCRIPTION_MAX_LENGTH,
  CATEGORY_SEO_TITLE_MAX_LENGTH,
  COVER_ALT_MAX_LENGTH,
  INT4_MAX,
  PRODUCT_STATUSES,
  RESERVED_ATTRIBUTE_SLUGS,
  SWATCH_COLOR_PATTERN,
} from "@/lib/schemas/catalog";

import { coverChecks } from "./cover";
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
 * A store's category (FER-010). Its slug is its page's address
 * (`/burbujeros`), unique within the store; `position` orders the header,
 * the home's sliders and the catalog's filter (FER-016). A category may
 * belong to a group, another category of the store (`parentId`, FER-043),
 * one level only, and its page is then under the group's
 * (`/bijouterie/anillos`). The database keeps the group in the same store
 * and never the category itself; the one level is kept by the service,
 * under the store's category lock. The cover is the page's photo (FER-043):
 * a computer image and an optional phone image.
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
    parentId: integer(),
    coverUrl: text(),
    coverWidth: integer(),
    coverHeight: integer(),
    coverPhoneUrl: text(),
    coverPhoneWidth: integer(),
    coverPhoneHeight: integer(),
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
    // The group is a category of the same store. NO ACTION: deleting a
    // group first takes its categories out of it (`deleteCategory`), and
    // deleting the store still cascades through all of them together.
    foreignKey({
      columns: [table.storeId, table.parentId],
      foreignColumns: [table.storeId, table.id],
      name: "category_store_parent_fk",
    }).onDelete("no action"),
    index().on(table.storeId, table.parentId),
    check("category_parent_not_self", sql`${table.parentId} <> ${table.id}`),
    ...coverChecks("category", {
      computer: {
        height: table.coverHeight,
        url: table.coverUrl,
        width: table.coverWidth,
      },
      phone: {
        height: table.coverPhoneHeight,
        url: table.coverPhoneUrl,
        width: table.coverPhoneWidth,
      },
    }),
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
    // The page's own title and description for search engines (FER-043);
    // `null` lets the page write them from the names.
    seoTitle: text(),
    seoDescription: text(),
    // What the cover shows, for a screen reader and a search engine.
    coverAlt: text(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.categoryId, table.locale),
    // The zod schema's caps, so an overflow is refused whoever writes it.
    check(
      "category_translation_texts_length",
      sql`char_length(${table.seoTitle}) <= ${sql.raw(String(CATEGORY_SEO_TITLE_MAX_LENGTH))} AND char_length(${table.seoDescription}) <= ${sql.raw(String(CATEGORY_SEO_DESCRIPTION_MAX_LENGTH))} AND char_length(${table.coverAlt}) <= ${sql.raw(String(COVER_ALT_MAX_LENGTH))}`
    ),
  ]
);

/**
 * Where a new article goes in the store's own order (FER-044): after every
 * article there is. A sequence, not `max() + 1`, so two articles added at
 * once never share a place, whoever inserts them (the service, the seed, a
 * test, or a build that predates the column and names no position).
 */
export const productPositionSequence = pgSequence("product_position_seq", {
  // The column is an `integer`: the sequence stops where it does.
  maxValue: INT4_MAX,
});

/**
 * An article ("artículo" on screen). A draft may lack its category and its
 * price while it is being loaded; publishing requires both, an image and a
 * Spanish title (`resolvePublishGaps`). The price is an integer in minor units
 * of the store's currency. The slug comes from the Spanish title and stops
 * following it once the article was first published (`publishedAt` set), so
 * a shared link keeps working. `position` is the order the store chooses, the
 * catalog's default (FER-044): a new article goes last; reordering them is
 * the article list's (FER-019).
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
    position: integer()
      .notNull()
      .default(sql`nextval('product_position_seq')`),
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
    // The catalog's default order (FER-044), the id breaking ties.
    index("product_position_list_index").on(
      table.storeId,
      table.status,
      table.position,
      table.id
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

const reservedAttributeSlugs = sql.raw(
  RESERVED_ATTRIBUTE_SLUGS.map((slug) => `'${slug}'`).join(", ")
);
const swatchPattern = sql.raw(`'${SWATCH_COLOR_PATTERN.source}'`);

/**
 * A store's own filter (FER-033), such as Color or Material. Its slug is the
 * catalog's query-string parameter (`?color=dorado`), unique in the store and
 * never one the catalog already uses.
 */
export const attribute = pgTable(
  "attribute",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    slug: text().notNull(),
    position: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.storeId, table.slug),
    check("attribute_slug_format", sql`${table.slug} ~ ${slugPattern}`),
    check(
      "attribute_slug_not_reserved",
      sql`${table.slug} NOT IN (${reservedAttributeSlugs})`
    ),
  ]
);

export const attributeTranslation = pgTable(
  "attribute_translation",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    attributeId: integer()
      .notNull()
      .references(() => attribute.id, { onDelete: "cascade" }),
    locale: localeEnum().notNull(),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [unique().on(table.attributeId, table.locale)]
);

/**
 * One value of a filter (gold, silver, purple), its slug the value in the
 * URL, unique within its filter. A color can carry the swatch shown beside
 * its name.
 */
export const attributeValue = pgTable(
  "attribute_value",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    attributeId: integer()
      .notNull()
      .references(() => attribute.id, { onDelete: "cascade" }),
    slug: text().notNull(),
    swatchColor: text(),
    position: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.attributeId, table.slug),
    check("attribute_value_slug_format", sql`${table.slug} ~ ${slugPattern}`),
    check(
      "attribute_value_swatch_hex",
      sql`${table.swatchColor} IS NULL OR ${table.swatchColor} ~ ${swatchPattern}`
    ),
  ]
);

export const attributeValueTranslation = pgTable(
  "attribute_value_translation",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    attributeValueId: integer()
      .notNull()
      .references(() => attributeValue.id, { onDelete: "cascade" }),
    locale: localeEnum().notNull(),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [unique().on(table.attributeValueId, table.locale)]
);

/**
 * The values an article carries; several of one filter are allowed (a gold
 * and purple bracelet). Deleting either side removes the pair.
 */
export const productAttributeValue = pgTable(
  "product_attribute_value",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    productId: integer()
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    attributeValueId: integer()
      .notNull()
      .references(() => attributeValue.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  // The pair's unique index leads with `productId`, so it serves that key;
  // `attributeValueId` gets its own for the catalog's filter.
  (table) => [
    unique().on(table.productId, table.attributeValueId),
    index().on(table.attributeValueId),
  ]
);
