import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { USER_ROLES } from "@/lib/schemas/access";

// Better Auth's tables. Their `text` ids are set by Better Auth; every other
// convention (timestamptz, `onDelete`, indexed foreign keys) is the house one.

export const userRoleEnum = pgEnum("user_role", USER_ROLES);

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  // Nothing reads it since FER-038: every login is an admin and reaches the
  // whole admin. It stays as the home of later roles; FER-041 turns its type
  // into the single value `admin` once no deployed build reads the two the
  // multi-store model had. Declared to Better Auth as an additional field it
  // never takes from a request (`input: false`).
  role: userRoleEnum().notNull().default("member"),
  createdAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({
      mode: "date",
      withTimezone: true,
      precision: 3,
    }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
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
  (table) => [index().on(table.userId)]
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({
      mode: "date",
      withTimezone: true,
      precision: 3,
    }),
    refreshTokenExpiresAt: timestamp({
      mode: "date",
      withTimezone: true,
      precision: 3,
    }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index().on(table.userId)]
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({
      mode: "date",
      withTimezone: true,
      precision: 3,
    }).notNull(),
    createdAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp({ mode: "date", withTimezone: true, precision: 3 })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index().on(table.identifier)]
);

// Better Auth's rate-limit counters (`rateLimit.storage: "database"`). The
// default in-memory store is per instance, so on serverless every instance
// would grant its own quota. `lastRequest` is epoch milliseconds.
export const rateLimit = pgTable("rate_limit", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});
