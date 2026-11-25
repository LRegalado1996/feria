import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";

import { product } from "./catalog";
import { store } from "./store";

// The day is each row's time: none of these tables carries timestamps.

/**
 * How many browser sessions saw an article on a business day in
 * Montevideo (FER-029): one row per article per day, made by its first view
 * and incremented by upsert. Deleted with the article.
 */
export const productViewDaily = pgTable(
  "product_view_daily",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    productId: integer()
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    viewCount: integer().notNull(),
  },
  (table) => [
    // The upsert's target, and the index the article's key needs.
    unique().on(table.productId, table.day),
    // The dashboard's ranges (FER-030), and the store's key.
    index().on(table.storeId, table.day),
    check("product_view_daily_count", sql`${table.viewCount} >= 1`),
  ]
);

/**
 * How many browser sessions visited the store on a business day in
 * Montevideo (FER-029): one row per day, incremented by upsert.
 */
export const storeVisitDaily = pgTable(
  "store_visit_daily",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    visitCount: integer().notNull(),
  },
  (table) => [
    // The upsert's target, the ranges and the store's key at once.
    unique().on(table.storeId, table.day),
    check("store_visit_daily_count", sql`${table.visitCount} >= 1`),
  ]
);

/**
 * What one client counted today, for the daily caps (FER-029). `bucket` is
 * a keyed hash of the day, the client's address and what it counted (the
 * visit, or one article), so a row names neither the address nor the
 * article, and the same client's rows of two days or two articles cannot be
 * linked. Only today's rows are read; each write deletes the older ones.
 */
export const metricRateLimit = pgTable(
  "metric_rate_limit",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    day: date({ mode: "string" }).notNull(),
    bucket: text().notNull(),
    hits: integer().notNull(),
  },
  (table) => [
    // The upsert's target; leading with the day, it also finds old rows.
    unique().on(table.day, table.bucket),
    check("metric_rate_limit_hits", sql`${table.hits} >= 1`),
  ]
);
