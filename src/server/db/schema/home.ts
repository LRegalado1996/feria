import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  ANNOUNCEMENT_SHORT_TEXT_MAX_LENGTH,
  ANNOUNCEMENT_TEXT_MAX_LENGTH,
  BANNER_CTA_MAX_LENGTH,
  BANNER_PLACEMENTS,
  BANNER_TITLE_MAX_LENGTH,
  FEATURED_MAX,
  HOME_LINK_MAX_LENGTH,
  HOME_SECTION_KINDS,
  RANKING_MAX,
} from "@/lib/schemas/home";

import { category, product } from "./catalog";
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

// A CHECK takes no bound parameters: each limit is written into the SQL as a
// literal, from the module the zod schemas read.
const limit = (value: number) => sql.raw(String(value));

/**
 * The days something shows on the storefront, both included, in the
 * store's time zone: date-only values, never instants (docs/agents/
 * database.md § Time). Either may be left out; the last never comes before
 * the first.
 */
const days = {
  endsOn: date({ mode: "string" }),
  startsOn: date({ mode: "string" }),
};

export const bannerPlacementEnum = pgEnum(
  "banner_placement",
  BANNER_PLACEMENTS
);

export const homeSectionKindEnum = pgEnum(
  "home_section_kind",
  HOME_SECTION_KINDS
);

/**
 * The lime bar above the storefront's header (FER-020): one per store,
 * which the admin switches on and off and may limit to some days. Its link
 * is a path of the site or an `https` address, held safe by the schema
 * (`isSafeHomeLink`).
 */
export const announcement = pgTable(
  "announcement",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    linkUrl: text(),
    isActive: boolean().notNull().default(false),
    ...days,
    ...timestamps,
  },
  (table) => [
    // One per store; also the index the foreign key needs.
    unique().on(table.storeId),
    check(
      "announcement_days_in_order",
      sql`${table.endsOn} IS NULL OR ${table.startsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}`
    ),
    check(
      "announcement_link_length",
      sql`char_length(${table.linkUrl}) <= ${limit(HOME_LINK_MAX_LENGTH)}`
    ),
  ]
);

/**
 * The announcement's words in one language: the line a computer shows, and
 * an optional shorter one a phone shows in its place. Spanish always has a
 * row; English only when it was written.
 */
export const announcementTranslation = pgTable(
  "announcement_translation",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    announcementId: integer()
      .notNull()
      .references(() => announcement.id, { onDelete: "cascade" }),
    locale: localeEnum().notNull(),
    text: text().notNull(),
    shortText: text(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.announcementId, table.locale),
    check(
      "announcement_translation_texts_length",
      sql`char_length(${table.text}) BETWEEN 1 AND ${limit(ANNOUNCEMENT_TEXT_MAX_LENGTH)} AND char_length(${table.shortText}) <= ${limit(ANNOUNCEMENT_SHORT_TEXT_MAX_LENGTH)}`
    ),
  ]
);

/**
 * A photo banner of the home (FER-020): a computer photo and an optional
 * phone one (held whole like a catalog cover), a link to an article, a
 * category or an address (at most one; a deleted article or category
 * leaves the banner without its link), the switch and its days. In the
 * cover, `coverPosition` orders the carousel; between rows, its place is
 * its `home_section` row, which the service keeps in step with
 * `placement`.
 */
export const banner = pgTable(
  "banner",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    placement: bannerPlacementEnum().notNull(),
    coverPosition: integer(),
    imageUrl: text().notNull(),
    imageWidth: integer().notNull(),
    imageHeight: integer().notNull(),
    imagePhoneUrl: text(),
    imagePhoneWidth: integer(),
    imagePhoneHeight: integer(),
    linkProductId: integer().references(() => product.id, {
      onDelete: "set null",
    }),
    linkCategoryId: integer().references(() => category.id, {
      onDelete: "set null",
    }),
    linkUrl: text(),
    isActive: boolean().notNull().default(true),
    ...days,
    ...timestamps,
  },
  (table) => [
    index().on(table.storeId),
    index().on(table.linkProductId),
    index().on(table.linkCategoryId),
    ...coverChecks("banner", {
      computer: {
        height: table.imageHeight,
        url: table.imageUrl,
        width: table.imageWidth,
      },
      phone: {
        height: table.imagePhoneHeight,
        url: table.imagePhoneUrl,
        width: table.imagePhoneWidth,
      },
    }),
    check(
      "banner_cover_position",
      sql`(${table.placement} = 'cover') = (${table.coverPosition} IS NOT NULL)`
    ),
    check(
      "banner_one_link",
      sql`num_nonnulls(${table.linkProductId}, ${table.linkCategoryId}, ${table.linkUrl}) <= 1`
    ),
    check(
      "banner_link_length",
      sql`char_length(${table.linkUrl}) <= ${limit(HOME_LINK_MAX_LENGTH)}`
    ),
    check(
      "banner_days_in_order",
      sql`${table.endsOn} IS NULL OR ${table.startsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}`
    ),
  ]
);

/**
 * A banner's words in one language: its title and its button's label
 * ("Comprar ahora" when it has none). Spanish always has a row.
 */
export const bannerTranslation = pgTable(
  "banner_translation",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    bannerId: integer()
      .notNull()
      .references(() => banner.id, { onDelete: "cascade" }),
    locale: localeEnum().notNull(),
    title: text().notNull(),
    ctaLabel: text(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.bannerId, table.locale),
    check(
      "banner_translation_texts_length",
      sql`char_length(${table.title}) BETWEEN 1 AND ${limit(BANNER_TITLE_MAX_LENGTH)} AND char_length(${table.ctaLabel}) <= ${limit(BANNER_CTA_MAX_LENGTH)}`
    ),
  ]
);

/**
 * One place of the home's sequence under the cover (FER-020), in
 * `position` order: a category's row, the "best sellers" row, the
 * "featured" row, or a banner between rows. Each category, each banner and
 * each curated row appears once; deleting a category or a banner takes its
 * place with it. A category with no place yet (a new one) shows after the
 * others, in the categories' own order, until the home is saved.
 */
export const homeSection = pgTable(
  "home_section",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    kind: homeSectionKindEnum().notNull(),
    categoryId: integer(),
    bannerId: integer().references(() => banner.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    unique().on(table.storeId, table.position),
    // Leads with `storeId`, so it also serves the (store, category) key.
    unique().on(table.storeId, table.categoryId),
    unique().on(table.bannerId),
    // The two curated rows appear once each.
    uniqueIndex("home_section_curated_row_once")
      .on(table.storeId, table.kind)
      .where(sql`${table.kind} IN ('best_sellers', 'featured')`),
    // The category is the store's: the pair references the category's.
    foreignKey({
      columns: [table.storeId, table.categoryId],
      foreignColumns: [category.storeId, category.id],
      name: "home_section_store_category_fk",
    }).onDelete("cascade"),
    check(
      "home_section_kind_target",
      sql`(${table.kind} = 'category') = (${table.categoryId} IS NOT NULL) AND (${table.kind} = 'banner') = (${table.bannerId} IS NOT NULL)`
    ),
  ]
);

/**
 * The curated "best sellers" (FER-020), picked and ordered by hand, not
 * computed from orders: up to `RANKING_MAX` articles. An article that is
 * not published or not available stays here and drops out of the
 * storefront's row, and the admin warns beside it.
 */
export const rankingEntry = pgTable(
  "ranking_entry",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    productId: integer()
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.storeId, table.position),
    unique().on(table.storeId, table.productId),
    index().on(table.productId),
    check(
      "ranking_entry_position_range",
      sql`${table.position} >= 0 AND ${table.position} < ${limit(RANKING_MAX)}`
    ),
  ]
);

/**
 * The "featured" articles (FER-020): none, or two to four in their order
 * (the two is the schema's, since a save replaces them all). The same rule
 * as the best sellers for an article that cannot be bought.
 */
export const featuredProduct = pgTable(
  "featured_product",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    productId: integer()
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.storeId, table.position),
    unique().on(table.storeId, table.productId),
    index().on(table.productId),
    check(
      "featured_product_position_range",
      sql`${table.position} >= 0 AND ${table.position} < ${limit(FEATURED_MAX)}`
    ),
  ]
);
