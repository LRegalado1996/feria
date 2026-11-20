import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import {
  COMING_SOON_EYEBROW_MAX_LENGTH,
  COMING_SOON_HEADLINE_MAX_LENGTH,
  COMING_SOON_LEAD_MAX_LENGTH,
  COMING_SOON_MARQUEE_MAX_LENGTH,
} from "@/lib/schemas/coming-soon";

import { localeEnum } from "./locale";
import { store } from "./store";

/**
 * The coming-soon page (FER-034): the switch that closes the store to the
 * public, and the day its countdown counts to. One row for the store, made
 * by the first save from the admin or by the seed. No row reads as
 * published: a database the migrations just reached (production on the day
 * this ships) keeps the store closed until someone opens it.
 */
export const comingSoon = pgTable("coming_soon", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  // Unique: one page per store, and the index the foreign key needs.
  storeId: integer()
    .notNull()
    .unique()
    .references(() => store.id, { onDelete: "cascade" }),
  published: boolean().notNull().default(true),
  // A day, not an instant: the countdown reads it at midnight in Montevideo.
  // `null` counts to the fair's opening (`FAIR_OPENS_AT`).
  countdownTo: date({ mode: "string" }),
  createdAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

/**
 * The page's texts in one language: the eyebrow over the headline (the
 * fair's dates), the headline, the text under it and the band. A `null`
 * text says the dictionary's (`src/content/{es,en}/coming-soon.ts`). The
 * headline and the band hold one line per display line or phrase.
 */
export const comingSoonTranslation = pgTable(
  "coming_soon_translation",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    comingSoonId: integer()
      .notNull()
      .references(() => comingSoon.id, { onDelete: "cascade" }),
    locale: localeEnum().notNull(),
    eyebrow: text(),
    headline: text(),
    lead: text(),
    marquee: text(),
    createdAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One row per language; it leads with the foreign key, so it is that
    // key's index too.
    unique().on(table.comingSoonId, table.locale),
    check(
      "coming_soon_translation_eyebrow_length",
      sql`char_length(${table.eyebrow}) <= ${sql.raw(String(COMING_SOON_EYEBROW_MAX_LENGTH))}`
    ),
    check(
      "coming_soon_translation_headline_length",
      sql`char_length(${table.headline}) <= ${sql.raw(String(COMING_SOON_HEADLINE_MAX_LENGTH))}`
    ),
    check(
      "coming_soon_translation_lead_length",
      sql`char_length(${table.lead}) <= ${sql.raw(String(COMING_SOON_LEAD_MAX_LENGTH))}`
    ),
    check(
      "coming_soon_translation_marquee_length",
      sql`char_length(${table.marquee}) <= ${sql.raw(String(COMING_SOON_MARQUEE_MAX_LENGTH))}`
    ),
  ]
);

export const comingSoonRelations = relations(comingSoon, ({ many }) => ({
  translations: many(comingSoonTranslation),
}));

export const comingSoonTranslationRelations = relations(
  comingSoonTranslation,
  ({ one }) => ({
    comingSoon: one(comingSoon, {
      fields: [comingSoonTranslation.comingSoonId],
      references: [comingSoon.id],
    }),
  })
);
