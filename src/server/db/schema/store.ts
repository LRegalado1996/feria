import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import {
  RESERVED_STORE_SLUGS,
  STORE_COLOR_PATTERN,
  STORE_CURRENCIES,
  STORE_SLUG_MAX_LENGTH,
  STORE_SLUG_MIN_LENGTH,
  STORE_SLUG_PATTERN,
} from "@/lib/schemas/store";

import { localeEnum } from "./locale";

export const currencyCodeEnum = pgEnum("currency_code", STORE_CURRENCIES);

// A CHECK takes no bound parameters, so these constants are written into the
// SQL as literals. They come from the same module the zod schemas read
// (`src/lib/schemas/store`), never from input, and hold no quote.
const slugPattern = sql.raw(`'${STORE_SLUG_PATTERN.source}'`);
const colorPattern = sql.raw(`'${STORE_COLOR_PATTERN.source}'`);
const reservedSlugs = sql.raw(
  RESERVED_STORE_SLUGS.map((slug) => `'${slug}'`).join(", ")
);
const slugMinLength = sql.raw(String(STORE_SLUG_MIN_LENGTH));
const slugMaxLength = sql.raw(String(STORE_SLUG_MAX_LENGTH));

export const store = pgTable(
  "store",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    // The first segment of every public URL of the store. Lowercase by its
    // check, so the unique constraint needs no case folding.
    slug: text().notNull().unique(),
    name: text().notNull(),
    whatsappNumber: text(),
    instagramUrl: text(),
    tiktokUrl: text(),
    currencyCode: currencyCodeEnum().notNull(),
    logoUrl: text(),
    isActive: boolean().notNull(),
    // The store's palette, the five storefront tokens (design.md § Storefront).
    colorBackground: text().notNull(),
    colorSurface: text().notNull(),
    colorForeground: text().notNull(),
    colorContrast: text().notNull(),
    colorAccent: text().notNull(),
    createdAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "store_slug_format",
      sql`${table.slug} ~ ${slugPattern} AND char_length(${table.slug}) BETWEEN ${slugMinLength} AND ${slugMaxLength}`
    ),
    check(
      "store_slug_not_reserved",
      sql`${table.slug} NOT IN (${reservedSlugs})`
    ),
    check(
      "store_color_background_hex",
      sql`${table.colorBackground} ~ ${colorPattern}`
    ),
    check(
      "store_color_surface_hex",
      sql`${table.colorSurface} ~ ${colorPattern}`
    ),
    check(
      "store_color_foreground_hex",
      sql`${table.colorForeground} ~ ${colorPattern}`
    ),
    check(
      "store_color_contrast_hex",
      sql`${table.colorContrast} ~ ${colorPattern}`
    ),
    check(
      "store_color_accent_hex",
      sql`${table.colorAccent} ~ ${colorPattern}`
    ),
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
  ]
);
