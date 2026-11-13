import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const post = pgTable(
  "post",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    name: text().notNull(),
    createdById: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index().on(table.createdById),
    // The feed's keyset, read backward for newest first. A plain ascending
    // index matches the default `DESC` (nulls first) order when scanned in
    // reverse; `.desc()` here would emit `DESC NULLS LAST`, which it doesn't.
    index().on(table.createdAt, table.id),
  ]
);
