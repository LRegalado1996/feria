import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  CATALOG_SLUG_MAX_LENGTH,
  CATALOG_SLUG_PATTERN,
  COVER_ALT_MAX_LENGTH,
} from "@/lib/schemas/catalog";
import {
  PAGE_NAME_MAX_LENGTH,
  PAGE_SEO_DESCRIPTION_MAX_LENGTH,
  PAGE_SEO_TITLE_MAX_LENGTH,
} from "@/lib/schemas/page";
import { STORE_CURRENCIES } from "@/lib/schemas/store";

import { coverChecks } from "./cover";
import { localeEnum } from "./locale";

export const currencyCodeEnum = pgEnum("currency_code", STORE_CURRENCIES);

/**
 * The company the site sells for (FER-038): one deployment is one store, so
 * this table holds exactly one row. Its colors and its logo are code (the
 * theme file and the brand files); the row keeps what a person sets in the
 * admin: the name, the contacts, the socials and the currency. Every catalog,
 * order and metrics table keeps its `storeId`, pointing here.
 *
 * Until FER-041 the database also keeps the columns the multi-store model
 * read (`slug`, `isActive`, `isDefault`, `logoUrl` and the five colors),
 * nullable and unread: the build a deploy replaces still reads them while
 * the migration runs (docs/agents/database.md § Migrations).
 */
export const store = pgTable(
  "store",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    name: text().notNull(),
    whatsappNumber: text(),
    instagramUrl: text(),
    tiktokUrl: text(),
    currencyCode: currencyCodeEnum().notNull(),
    // The cover of the page of all the store's articles (FER-043), as a
    // category holds its own: a computer image and an optional phone image.
    catalogCoverUrl: text(),
    catalogCoverWidth: integer(),
    catalogCoverHeight: integer(),
    catalogCoverPhoneUrl: text(),
    catalogCoverPhoneWidth: integer(),
    catalogCoverPhoneHeight: integer(),
    /**
     * The page `/` shows (FER-058): exactly one, always one of the store's
     * own pages (the pair references the page's), and that page cannot be
     * deleted while it is the home. Migration 0021 gave every store its
     * first page and pointed here; 0022 made it required.
     */
    homePageId: integer().notNull(),
    createdAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Every row indexes the same constant, so a second row is a unique
    // violation: the database refuses it, whatever writes it.
    uniqueIndex("store_single_row").on(sql`(true)`),
    index().on(table.homePageId),
    foreignKey({
      columns: [table.id, table.homePageId],
      // oxlint-disable-next-line eslint/no-use-before-define -- the store and its pages reference each other; this callback runs once both exist (1 here)
      foreignColumns: [page.storeId, page.id],
      name: "store_home_page_fk",
    }).onDelete("no action"),
    ...coverChecks("store_catalog", {
      computer: {
        height: table.catalogCoverHeight,
        url: table.catalogCoverUrl,
        width: table.catalogCoverWidth,
      },
      phone: {
        height: table.catalogCoverPhoneHeight,
        url: table.catalogCoverPhoneUrl,
        width: table.catalogCoverPhoneWidth,
      },
    }),
  ]
);

export const storeTranslation = pgTable(
  "store_translation",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    locale: localeEnum().notNull(),
    tagline: text().notNull(),
    description: text().notNull(),
    // What the catalog's cover shows (FER-043).
    catalogCoverAlt: text(),
    createdAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One text per language. Its index leads with `storeId`, so it is also
    // the index the foreign key needs: a second one would only cost writes.
    unique().on(table.storeId, table.locale),
    check(
      "store_translation_catalog_cover_alt_length",
      sql`char_length(${table.catalogCoverAlt}) <= ${sql.raw(String(COVER_ALT_MAX_LENGTH))}`
    ),
  ]
);

/**
 * A page of the store built from sections (FER-058, FER-060): its address
 * (`/<slug>`, the same under `/en`, unique in the store and kept clear of
 * the categories' and the site's own paths by the service), whether it is
 * published and whether the header lists it; its name and texts per
 * language are `page_translation`'s. A page holds no content of its own:
 * what it shows is its sections' and its cover's, which point at
 * store-level content. Which page is the home is the store's to say
 * (`store.homePageId`), so there is always exactly one; migration 0021
 * gave every store its first page and made it the home, 0025 named it
 * "Home" at `/home`.
 */
// Here, beside the store, not in `page.ts` with its sections: the store
// names its home page, and two schema files must not import each other.
export const page = pgTable(
  "page",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    // Typed by hand: the store references its home page back, and the two
    // tables' types cannot both be inferred from each other.
    storeId: integer()
      .notNull()
      .references((): AnyPgColumn => store.id, { onDelete: "cascade" }),
    slug: text().notNull(),
    isPublished: boolean().notNull().default(false),
    showInHeader: boolean().notNull().default(false),
    createdAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // What a section's and the store's (store, page) pairs reference; it
    // leads with `storeId`, so it also serves the store's foreign key.
    unique("page_store_id_unique").on(table.storeId, table.id),
    unique().on(table.storeId, table.slug),
    check(
      "page_slug_format",
      sql`${table.slug} ~ ${sql.raw(`'${CATALOG_SLUG_PATTERN.source}'`)} AND char_length(${table.slug}) <= ${sql.raw(String(CATALOG_SLUG_MAX_LENGTH))}`
    ),
  ]
);

/**
 * A page's words in one language (FER-060): its name (its `h1`, and its
 * entry in the header and the admin's list) and its title and description
 * for search engines, each made from the name when left out. Spanish
 * always; English only when it has a name.
 */
export const pageTranslation = pgTable(
  "page_translation",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    pageId: integer()
      .notNull()
      .references(() => page.id, { onDelete: "cascade" }),
    locale: localeEnum().notNull(),
    name: text().notNull(),
    seoTitle: text(),
    seoDescription: text(),
    createdAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique().on(table.pageId, table.locale),
    check(
      "page_translation_texts_length",
      sql`char_length(${table.name}) BETWEEN 1 AND ${sql.raw(String(PAGE_NAME_MAX_LENGTH))} AND char_length(${table.seoTitle}) <= ${sql.raw(String(PAGE_SEO_TITLE_MAX_LENGTH))} AND char_length(${table.seoDescription}) <= ${sql.raw(String(PAGE_SEO_DESCRIPTION_MAX_LENGTH))}`
    ),
  ]
);
