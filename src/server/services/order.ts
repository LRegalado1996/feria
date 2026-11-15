import { randomBytes, randomInt } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";

import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { INT4_MAX } from "@/lib/schemas/catalog";
import {
  type CreateOrderValues,
  ORDER_CODE_ALPHABET,
  ORDER_CODE_LENGTH,
  ORDER_MOVES,
  ORDERS_PAGE_SIZE,
  ORDERS_PER_IP_PER_HOUR,
  ORDERS_PER_PHONE_PER_HOUR,
  type OrderStatus,
} from "@/lib/schemas/order";
import type { DatabaseClient } from "@/server/db";
import {
  customerOrder,
  orderItem,
  orderStatusEvent,
  product,
  productTranslation,
  store,
  user,
} from "@/server/db/schema";

interface StoreScope {
  storeId: number;
}

const HOUR_MS = 60 * 60 * 1000;
// A code is tried again on a clash; with 31^5 codes per store this many
// clashes in a row means something else is wrong.
const CODE_ATTEMPTS = 20;

function orderNotFound() {
  return new ORPCError("NOT_FOUND", { message: "Order not found" });
}

/** The public link's key: 32 random bytes, base64url (43 characters). */
export function generateOrderToken() {
  return randomBytes(32).toString("base64url");
}

/** A short code read aloud at the stall, from an alphabet with no look-alikes. */
export function generateOrderCode() {
  return Array.from(
    { length: ORDER_CODE_LENGTH },
    () => ORDER_CODE_ALPHABET[randomInt(ORDER_CODE_ALPHABET.length)]
  ).join("");
}

/**
 * A phone shown on the order's public page, which anyone with the link can
 * open: the last three digits, after `+598` for a Uruguayan number or the
 * bare `+` for any other (whose country code length varies), the rest
 * hidden.
 */
export function maskPhone(phone: string) {
  const country = phone.startsWith("+598") ? 4 : 1;

  return `${phone.slice(0, country)}${"•".repeat(Math.max(phone.length - country - 3, 0))}${phone.slice(-3)}`;
}

/**
 * Refuses an order past an hourly limit: `rows` are the creation times in
 * the last hour that count against it, oldest first. The answer says when
 * the oldest leaves the window, for a countdown instead of a blind retry.
 */
function assertUnderLimit(
  rows: { createdAt: Date }[],
  limit: number,
  now: Date
) {
  const oldest = rows.at(-limit);

  if (rows.length < limit || !oldest) {
    return;
  }

  const retryAfter = Math.max(
    Math.ceil((oldest.createdAt.getTime() + HOUR_MS - now.getTime()) / 1000),
    1
  );

  throw new ORPCError("TOO_MANY_REQUESTS", {
    data: { retryAfter },
    message: "Too many orders for now",
  });
}

/** The creation times, oldest first, of the last hour's orders matching `where`. */
async function lastHour(
  tx: DatabaseClient,
  where: ReturnType<typeof eq>,
  now: Date
) {
  return await tx
    .select({ createdAt: customerOrder.createdAt })
    .from(customerOrder)
    .where(
      and(where, gt(customerOrder.createdAt, new Date(now.getTime() - HOUR_MS)))
    )
    .orderBy(asc(customerOrder.createdAt));
}

/**
 * The store's published, available, priced articles among `ids`, each with
 * its title in `locale` (Spanish when it has none), locked against an edit
 * or an unpublication until the order is written.
 */
async function lockOrderableArticles(
  tx: DatabaseClient,
  { ids, locale, storeId }: StoreScope & { ids: number[]; locale: Locale }
) {
  const rows = await tx
    .select({
      id: product.id,
      isAvailable: product.isAvailable,
      priceAmount: product.priceAmount,
    })
    .from(product)
    .where(
      and(
        inArray(product.id, ids),
        eq(product.storeId, storeId),
        eq(product.status, "published")
      )
    )
    // In id order, like every other writer locking several articles, so
    // two of them never each hold what the other waits for.
    .orderBy(asc(product.id))
    .for("share");
  const titles = await tx
    .select({
      locale: productTranslation.locale,
      productId: productTranslation.productId,
      title: productTranslation.title,
    })
    .from(productTranslation)
    .where(inArray(productTranslation.productId, ids));

  return rows.map((row) => ({
    ...row,
    title:
      pickTranslation(
        titles.filter((title) => title.productId === row.id),
        locale
      )?.title ?? "",
  }));
}

/**
 * Takes an anonymous shopper's order (FER-025). The server loads every
 * article itself and computes every price and the total: an article that
 * is missing, a draft or another store's is NOT_FOUND, one unavailable or
 * with no price is BAD_REQUEST, and nothing the client could send is a price.
 * The same `requestKey` again answers the order it already created. Past five
 * orders an hour per phone, or twenty per client, it answers
 * TOO_MANY_REQUESTS with when to retry.
 */
export async function createOrder(
  db: DatabaseClient,
  {
    clientKey,
    now: givenNow,
    storeId,
    values,
  }: StoreScope & {
    /** A keyed hash of the client's IP, `null` when the platform gives none. */
    clientKey: string | null;
    /** The moment the order is taken at; the database's clock unless given. */
    now?: Date;
    values: Omit<CreateOrderValues, "storeSlug">;
  }
) {
  return await db.transaction(async (tx) => {
    // One order at a time per phone and per client (their hourly counts)
    // and per store (its codes and request keys); always in this order, so
    // two never deadlock.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`order.phone:${values.customerPhone}`}))`
    );

    if (clientKey !== null) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`order.client:${clientKey}`}))`
      );
    }

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`order.store:${storeId}`}))`
    );
    // Read after the locks (docs/agents/database.md § Time): an order that
    // waited on one is stamped after the orders it waited for.
    const now = givenNow ?? (await databaseNow(tx));

    const [already] = await tx
      .select({
        code: customerOrder.code,
        customerPhone: customerOrder.customerPhone,
        token: customerOrder.token,
      })
      .from(customerOrder)
      .where(
        and(
          eq(customerOrder.storeId, storeId),
          eq(customerOrder.requestKey, values.requestKey)
        )
      );

    if (already) {
      // The same submit again is the same phone: anything else reusing the
      // key never receives another shopper's order link.
      if (already.customerPhone !== values.customerPhone) {
        throw new ORPCError("CONFLICT", {
          message: "That request was already used for another order",
        });
      }

      return { code: already.code, token: already.token };
    }

    assertUnderLimit(
      await lastHour(
        tx,
        eq(customerOrder.customerPhone, values.customerPhone),
        now
      ),
      ORDERS_PER_PHONE_PER_HOUR,
      now
    );

    if (clientKey !== null) {
      assertUnderLimit(
        await lastHour(tx, eq(customerOrder.clientKey, clientKey), now),
        ORDERS_PER_IP_PER_HOUR,
        now
      );
    }

    // The store's currency, read here and kept from changing until the
    // order is written: read before the transaction, a change committing
    // meanwhile would pair the old currency with the new prices.
    const [shop] = await tx
      .select({ currencyCode: store.currencyCode })
      .from(store)
      .where(eq(store.id, storeId))
      .for("share");

    if (!shop) {
      throw new ORPCError("NOT_FOUND", { message: "Store not found" });
    }

    const articles = await lockOrderableArticles(tx, {
      ids: values.items.map((item) => item.productId),
      locale: values.locale,
      storeId,
    });
    const byId = new Map(articles.map((article) => [article.id, article]));
    const lines = values.items.map((item) => {
      const article = byId.get(item.productId);

      if (!article) {
        throw new ORPCError("NOT_FOUND", { message: "Article not found" });
      }

      if (!article.isAvailable || article.priceAmount === null) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Article not available",
        });
      }

      return {
        productId: article.id,
        quantity: item.quantity,
        title: article.title,
        unitPriceAmount: article.priceAmount,
      };
    });
    const totalAmount = lines.reduce(
      (sum, line) => sum + line.unitPriceAmount * line.quantity,
      0
    );

    if (totalAmount > INT4_MAX) {
      throw new ORPCError("BAD_REQUEST", { message: "Order total too large" });
    }

    const code = await freeOrderCode(tx, storeId);
    const [created] = await tx
      .insert(customerOrder)
      .values({
        clientKey,
        code,
        createdAt: now,
        currencyCode: shop.currencyCode,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        locale: values.locale,
        note: values.note,
        requestKey: values.requestKey,
        storeId,
        token: generateOrderToken(),
        totalAmount,
      })
      .returning({
        code: customerOrder.code,
        id: customerOrder.id,
        token: customerOrder.token,
      });

    if (!created) {
      throw new Error("Inserting an order returned no row");
    }

    await tx
      .insert(orderItem)
      .values(lines.map((line) => ({ ...line, orderId: created.id })));
    await tx.insert(orderStatusEvent).values({
      changedById: null,
      createdAt: now,
      orderId: created.id,
      status: "received",
    });

    return { code: created.code, token: created.token };
  });
}

/** The database's clock at this moment, not the transaction's start. */
async function databaseNow(tx: DatabaseClient) {
  const result = await tx.execute<{ now: Date | string }>(
    sql`select clock_timestamp() as now`
  );
  const value = result.rows[0]?.now;

  if (value === undefined) {
    throw new Error("The database gave no time");
  }

  return new Date(value);
}

/** A code the store has not used, under the store's order lock. */
async function freeOrderCode(tx: DatabaseClient, storeId: number) {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = generateOrderCode();
    const [taken] = await tx
      .select({ id: customerOrder.id })
      .from(customerOrder)
      .where(
        and(eq(customerOrder.storeId, storeId), eq(customerOrder.code, code))
      );

    if (!taken) {
      return code;
    }
  }

  throw new Error("No free order code after many attempts");
}

/** An order's items, in the order they were bought. */
async function orderItems(db: DatabaseClient, orderId: number) {
  return await db
    .select({
      productId: orderItem.productId,
      quantity: orderItem.quantity,
      title: orderItem.title,
      unitPriceAmount: orderItem.unitPriceAmount,
    })
    .from(orderItem)
    .where(eq(orderItem.orderId, orderId))
    .orderBy(asc(orderItem.id));
}

/**
 * What the shopper's order page shows (FER-026), found by its link's token
 * in that store: never the internal id, and the phone masked, since anyone
 * holding the link can open it.
 */
export async function getOrderByToken(
  db: DatabaseClient,
  { storeId, token }: StoreScope & { token: string }
) {
  const [found] = await db
    .select({
      code: customerOrder.code,
      createdAt: customerOrder.createdAt,
      currencyCode: customerOrder.currencyCode,
      customerName: customerOrder.customerName,
      customerPhone: customerOrder.customerPhone,
      id: customerOrder.id,
      note: customerOrder.note,
      phoneVerifiedAt: customerOrder.phoneVerifiedAt,
      status: customerOrder.status,
      totalAmount: customerOrder.totalAmount,
    })
    .from(customerOrder)
    .where(
      and(eq(customerOrder.storeId, storeId), eq(customerOrder.token, token))
    );

  if (!found) {
    throw orderNotFound();
  }

  const { customerPhone, id, phoneVerifiedAt, ...shown } = found;
  const items = await orderItems(db, id);

  return {
    ...shown,
    customerPhone: maskPhone(customerPhone),
    items: items.map(({ productId: _productId, ...item }) => item),
    phoneVerified: phoneVerifiedAt !== null,
  };
}

/**
 * The store's orders, newest first, one status or all, a page at a time:
 * the cursor is the last row's whole sort key, so a page never repeats or
 * skips an order created meanwhile.
 */
export async function listOrders(
  db: DatabaseClient,
  {
    cursor,
    limit = ORDERS_PAGE_SIZE,
    status,
    storeId,
  }: StoreScope & {
    cursor?: { createdAt: Date; id: number };
    limit?: number;
    status?: OrderStatus;
  }
) {
  const rows = await db
    .select({
      code: customerOrder.code,
      createdAt: customerOrder.createdAt,
      currencyCode: customerOrder.currencyCode,
      customerName: customerOrder.customerName,
      id: customerOrder.id,
      phoneVerifiedAt: customerOrder.phoneVerifiedAt,
      status: customerOrder.status,
      totalAmount: customerOrder.totalAmount,
    })
    .from(customerOrder)
    .where(
      and(
        eq(customerOrder.storeId, storeId),
        status ? eq(customerOrder.status, status) : undefined,
        cursor
          ? or(
              lt(customerOrder.createdAt, cursor.createdAt),
              and(
                eq(customerOrder.createdAt, cursor.createdAt),
                lt(customerOrder.id, cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(customerOrder.createdAt), desc(customerOrder.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    items: page.map(({ phoneVerifiedAt, ...row }) => ({
      ...row,
      phoneVerified: phoneVerifiedAt !== null,
    })),
    nextCursor:
      rows.length > limit && last
        ? { createdAt: last.createdAt, id: last.id }
        : null,
  };
}

/**
 * One of the store's orders for its staff (FER-027): the full phone, the
 * items and the status history with who set each one.
 */
export async function getOrder(
  db: DatabaseClient,
  { id, storeId }: StoreScope & { id: number }
) {
  // One snapshot: a status change committing between the order and its
  // history would show a status the history does not end in.
  return await db.transaction(
    async (tx) => {
      const [found] = await tx
        .select({
          code: customerOrder.code,
          createdAt: customerOrder.createdAt,
          currencyCode: customerOrder.currencyCode,
          customerName: customerOrder.customerName,
          customerPhone: customerOrder.customerPhone,
          id: customerOrder.id,
          locale: customerOrder.locale,
          note: customerOrder.note,
          phoneVerifiedAt: customerOrder.phoneVerifiedAt,
          status: customerOrder.status,
          totalAmount: customerOrder.totalAmount,
        })
        .from(customerOrder)
        .where(
          and(eq(customerOrder.id, id), eq(customerOrder.storeId, storeId))
        );

      if (!found) {
        throw orderNotFound();
      }

      const history = await tx
        .select({
          changedByName: user.name,
          createdAt: orderStatusEvent.createdAt,
          status: orderStatusEvent.status,
        })
        .from(orderStatusEvent)
        .leftJoin(user, eq(user.id, orderStatusEvent.changedById))
        .where(eq(orderStatusEvent.orderId, id))
        // In the order they were appended: each move is appended under the
        // order's row lock, so its id follows the move it waited for.
        .orderBy(asc(orderStatusEvent.id));
      const { phoneVerifiedAt, ...shown } = found;

      return {
        ...shown,
        history,
        items: await orderItems(tx, id),
        phoneVerified: phoneVerifiedAt !== null,
      };
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
}

/**
 * Moves an order to `status` if its current one allows it (`ORDER_MOVES`),
 * recording who did it. The order is locked first, so two staff tapping at
 * once move it one after the other: the second is judged against the first's
 * result and refused with CONFLICT when that move no longer applies.
 */
export async function changeOrderStatus(
  tx: DatabaseClient,
  {
    id,
    status,
    storeId,
    userId,
  }: StoreScope & { id: number; status: OrderStatus; userId: string }
) {
  const [found] = await tx
    .select({ status: customerOrder.status })
    .from(customerOrder)
    .where(and(eq(customerOrder.id, id), eq(customerOrder.storeId, storeId)))
    .for("update");

  if (!found) {
    throw orderNotFound();
  }

  if (!ORDER_MOVES[found.status].includes(status)) {
    throw new ORPCError("CONFLICT", {
      message: "That status change is not allowed",
    });
  }

  await tx
    .update(customerOrder)
    .set({ status })
    .where(eq(customerOrder.id, id));
  await tx
    .insert(orderStatusEvent)
    // Stamped now, after the lock, not when the transaction began.
    .values({
      changedById: userId,
      createdAt: sql`clock_timestamp()`,
      orderId: id,
      status,
    });

  return { id, status };
}
