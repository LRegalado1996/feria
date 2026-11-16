import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { store } from "./store";

/**
 * Who belongs to which store (FER-009). Every member of a store has the same
 * permissions on it; a superadmin needs no row. Deleting the store or the
 * user deletes the membership.
 */
export const storeMember = pgTable(
  "store_member",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    userId: text()
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
  // The pair's unique index leads with `storeId`, so it also serves that
  // foreign key; `userId` gets its own.
  (table) => [
    unique().on(table.storeId, table.userId),
    index().on(table.userId),
  ]
);
