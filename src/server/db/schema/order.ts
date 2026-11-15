import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { ORDER_QUANTITY_MAX, ORDER_STATUSES } from "@/lib/schemas/order";

import { user } from "./auth";
import { product } from "./catalog";
import { localeEnum } from "./locale";
import { currencyCodeEnum, store } from "./store";

const moment = () =>
  timestamp({ mode: "date", withTimezone: true, precision: 3 });

export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);

/**
 * A shopper's order (FER-025). `order` is a reserved word. Reached without a
 * login through its random `token`; `code` is the short one read aloud at
 * the stall. The currency is copied from the store at purchase time.
 */
export const customerOrder = pgTable(
  "customer_order",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    storeId: integer()
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    code: text().notNull(),
    // The checkout's own id for one submit: a resubmit finds its order.
    requestKey: text().notNull(),
    customerName: text().notNull(),
    // International format, `+59899123456`.
    customerPhone: text().notNull(),
    phoneVerifiedAt: moment(),
    status: orderStatusEnum().notNull().default("received"),
    note: text(),
    totalAmount: integer().notNull(),
    currencyCode: currencyCodeEnum().notNull(),
    locale: localeEnum().notNull(),
    // A keyed hash of the client's IP for the hourly limit, never the IP.
    clientKey: text(),
    createdAt: moment().notNull().defaultNow(),
    updatedAt: moment()
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique().on(table.storeId, table.code),
    unique().on(table.storeId, table.requestKey),
    // The admin's list, newest first, and its keyset cursor.
    index().on(table.storeId, table.createdAt.desc(), table.id.desc()),
    index().on(table.customerPhone, table.createdAt),
    index().on(table.clientKey, table.createdAt),
    check("customer_order_total", sql`${table.totalAmount} >= 0`),
  ]
);

/** What was bought, with its title and price copied at purchase time. */
export const orderItem = pgTable(
  "order_item",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    orderId: integer()
      .notNull()
      .references(() => customerOrder.id, { onDelete: "cascade" }),
    // Kept when the article is deleted: the copied title and price stay.
    productId: integer().references(() => product.id, { onDelete: "set null" }),
    title: text().notNull(),
    unitPriceAmount: integer().notNull(),
    quantity: integer().notNull(),
  },
  (table) => [
    index().on(table.orderId),
    index().on(table.productId),
    check("order_item_price", sql`${table.unitPriceAmount} >= 0`),
    check(
      "order_item_quantity",
      sql`${table.quantity} BETWEEN 1 AND ${sql.raw(String(ORDER_QUANTITY_MAX))}`
    ),
  ]
);

/** An order's history, append only: each status and who set it. */
export const orderStatusEvent = pgTable(
  "order_status_event",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    orderId: integer()
      .notNull()
      .references(() => customerOrder.id, { onDelete: "cascade" }),
    status: orderStatusEnum().notNull(),
    // `null` for the shopper's own creation, or a login since deleted.
    changedById: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: moment().notNull().defaultNow(),
  },
  (table) => [
    index().on(table.orderId, table.createdAt),
    index().on(table.changedById),
  ]
);
