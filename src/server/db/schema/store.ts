import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { COVER_ALT_MAX_LENGTH } from "@/lib/schemas/catalog";
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
