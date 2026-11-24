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
  PAGE_SECTION_KINDS,
  RANKING_MAX,
  SPOTLIGHT_LABEL_MAX_LENGTH,
  SPOTLIGHT_PHRASE_MAX_LENGTH,
  UNTARGETED_SECTION_KINDS,
} from "@/lib/schemas/page";

import { category, product } from "./catalog";
import { coverChecks } from "./cover";
import { localeEnum } from "./locale";
import { page, store } from "./store";

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

/**
 * The kinds the retired `home_section` held (FER-020), frozen here: that
 * table is no longer read or written (FER-058) and goes in FER-061.
 */
const LEGACY_HOME_SECTION_KINDS = [
  "category",
  "best_sellers",
  "featured",
  "banner",
] as const;

export const homeSectionKindEnum = pgEnum(
  "home_section_kind",
  LEGACY_HOME_SECTION_KINDS
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
 * A photo banner (FER-020): store-level content, which a page shows in its
 * cover (`page_cover_banner`) or between its rows (`page_section`), FER-058.
 * A computer photo and an optional phone one (held whole like a catalog
 * cover), a link to an article, a category or an address (at most one; a
 * deleted article or category leaves the banner without its link), the
 * switch and its days.
 *
 * `placement` and `coverPosition` are FER-020's home-only placing, no
 * longer read or written since FER-058 (a page says where a banner shows):
 * `placement` lost its NOT NULL so a new banner leaves both empty, and
 * FER-061 drops them.
 */
export const banner = pgTable(
  "banner",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    placement: bannerPlacementEnum(),
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
 * FER-020's sequence of the home, retired by FER-058 for `page_section`,
 * which migration 0021 filled from it. Nothing reads or writes it; it stays
 * declared only so the schema's diff does not drop it before the build that
 * wrote it is gone (expand, then contract: FER-061 drops it).
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
 * The "featured" articles (FER-020): none, or two to sixteen in their order
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

/**
 * An article spotlight (FER-059): one article, large, in a dark block
 * between a page's rows. Store-level content like a banner: where it shows
 * is a page's (`page_section`). Its photo, name and price are the
 * article's; deleting the article deletes it, and its places with it. One
 * whose article is not published or cannot be bought stays here and drops
 * out of the storefront; the admin warns beside it.
 */
export const spotlight = pgTable(
  "spotlight",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    productId: integer()
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index().on(table.storeId), index().on(table.productId)]
);

/**
 * A spotlight's words in one language: its pill label ("Nuevo") and its
 * short phrase, each optional. A row only while it holds one of them.
 */
export const spotlightTranslation = pgTable(
  "spotlight_translation",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    spotlightId: integer()
      .notNull()
      .references(() => spotlight.id, { onDelete: "cascade" }),
    locale: localeEnum().notNull(),
    label: text(),
    phrase: text(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.spotlightId, table.locale),
    check(
      "spotlight_translation_texts",
      sql`num_nonnulls(${table.label}, ${table.phrase}) >= 1 AND char_length(${table.label}) BETWEEN 1 AND ${limit(SPOTLIGHT_LABEL_MAX_LENGTH)} AND char_length(${table.phrase}) BETWEEN 1 AND ${limit(SPOTLIGHT_PHRASE_MAX_LENGTH)}`
    ),
  ]
);

/** Kinds as a SQL list, for a CHECK or an index's predicate. */
const kindList = (kinds: readonly string[]) =>
  sql.raw(kinds.map((kind) => `'${kind}'`).join(", "));

/** The kinds as a SQL list, for the CHECK that holds `kind` to them. */
const sectionKinds = kindList(PAGE_SECTION_KINDS);

/**
 * One place of a page's sequence under its cover (FER-058, after FER-020's
 * `home_section`), in `position` order: a block of the catalogue
 * (`PAGE_SECTION_KINDS`). Each kind with a target names it in its own
 * column, held beside its kind by a CHECK of its own; a kind with none (the
 * curated rows, "how to buy") appears once per page. `kind` is text held by a CHECK, not
 * an enum: adding a block rewrites the CHECK in one migration, where a new
 * enum value could not be used in the transaction that adds it
 * (docs/agents/database.md § Migrations). Deleting the page, a category or
 * a banner takes its places with it. `storeId` is the page's, held so by
 * the (store, page) key, and keeps a category to the page's store.
 */
export const pageSection = pgTable(
  "page_section",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer().notNull(),
    pageId: integer().notNull(),
    position: integer().notNull(),
    kind: text({ enum: PAGE_SECTION_KINDS }).notNull(),
    categoryId: integer(),
    bannerId: integer().references(() => banner.id, { onDelete: "cascade" }),
    spotlightId: integer().references(() => spotlight.id, {
      onDelete: "cascade",
    }),
    ...timestamps,
  },
  (table) => [
    // Each leads with `pageId`: they also serve the page's foreign key.
    unique().on(table.pageId, table.position),
    unique().on(table.pageId, table.categoryId),
    unique().on(table.pageId, table.bannerId),
    unique().on(table.pageId, table.spotlightId),
    uniqueIndex("page_section_untargeted_once")
      .on(table.pageId, table.kind)
      .where(sql`${table.kind} IN (${kindList(UNTARGETED_SECTION_KINDS)})`),
    index().on(table.storeId, table.categoryId),
    index().on(table.bannerId),
    index().on(table.spotlightId),
    foreignKey({
      columns: [table.storeId, table.pageId],
      foreignColumns: [page.storeId, page.id],
      name: "page_section_store_page_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.storeId, table.categoryId],
      foreignColumns: [category.storeId, category.id],
      name: "page_section_store_category_fk",
    }).onDelete("cascade"),
    check("page_section_kind", sql`${table.kind} IN (${sectionKinds})`),
    check("page_section_position", sql`${table.position} >= 0`),
    check(
      "page_section_category_target",
      sql`(${table.kind} = 'category') = (${table.categoryId} IS NOT NULL)`
    ),
    check(
      "page_section_banner_target",
      sql`(${table.kind} = 'banner') = (${table.bannerId} IS NOT NULL)`
    ),
    check(
      "page_section_spotlight_target",
      sql`(${table.kind} = 'spotlight') = (${table.spotlightId} IS NOT NULL)`
    ),
  ]
);

/**
 * The banners a page opens on (FER-058, after FER-020's `placement` and
 * `coverPosition`), in the carousel's order. A banner is in a page's cover
 * or between its rows, never both: the service moves it from one to the
 * other. Deleting the page or the banner takes the place with it.
 */
export const pageCoverBanner = pgTable(
  "page_cover_banner",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    pageId: integer()
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    bannerId: integer()
      .notNull()
      .references(() => banner.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    // Leads with `pageId`: it also serves the page's foreign key.
    unique().on(table.pageId, table.position),
    unique().on(table.pageId, table.bannerId),
    index().on(table.bannerId),
    check("page_cover_banner_position", sql`${table.position} >= 0`),
  ]
);
