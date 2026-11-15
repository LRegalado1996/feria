import { randomInt, randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ORDER_STATUSES,
  ORDER_TOKEN_PATTERN,
  type OrderStatus,
} from "@/lib/schemas/order";
import { createStoreSchema } from "@/lib/schemas/store";
import { type DatabaseClient, db } from "@/server/db";
import {
  customerOrder,
  orderItem,
  orderStatusEvent,
  product,
  productImage,
  productTranslation,
  store,
  user,
} from "@/server/db/schema";
import { createProduct, publishProduct } from "@/server/services/catalog";
import { createCategory } from "@/server/services/category";
import { createStore } from "@/server/services/store";
import {
  backendPid,
  deferred,
  readyOrFailed,
  releaseHeldWriters,
  releaseOnTeardown,
  waitUntilAdvisoryBlocked,
  waitUntilBlockedBy,
} from "@/server/test/two-writers";

import {
  changeOrderStatus,
  countOrders,
  createOrder,
  getOrder,
  getOrderByToken,
  listOrders,
} from "./order";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Deleting a store cascades to its articles and orders.
const createdStoreIds: number[] = [];
const createdUserIds: string[] = [];

afterEach(async () => {
  await releaseHeldWriters();
  await db.delete(store).where(inArray(store.id, createdStoreIds.splice(0)));
  await db.delete(user).where(inArray(user.id, createdUserIds.splice(0)));
});

async function makeStore(currencyCode: "UYU" | "USD" = "UYU") {
  const row = await createStore(
    db,
    createStoreSchema.parse({
      colorAccent: "#c8f31d",
      colorBackground: "#f2f3f0",
      colorContrast: "#111312",
      colorForeground: "#111312",
      colorSurface: "#ffffff",
      currencyCode,
      instagramUrl: null,
      isActive: true,
      isDefault: false,
      logoUrl: null,
      name: "Orders Test",
      slug: `orders-${randomUUID().slice(0, 8)}`,
      tiktokUrl: null,
      translations: [],
      whatsappNumber: null,
    })
  );
  createdStoreIds.push(row.id);

  return row;
}

// Publishing needs a category: one per store, made on first use. The
// promise is kept, so articles made at once share it.
const storeCategories = new Map<number, Promise<number>>();

async function categoryOf(storeId: number) {
  const known =
    storeCategories.get(storeId) ??
    db
      .transaction(
        async (tx) =>
          await createCategory(tx, {
            storeId,
            values: { nameEn: null, nameEs: "Varios" },
          })
      )
      .then((created) => created.id);
  storeCategories.set(storeId, known);

  return await known;
}

async function makeUser(name: string) {
  const id = randomUUID();
  await db.insert(user).values({
    email: `${id}@example.com`,
    emailVerified: true,
    id,
    name,
  });
  createdUserIds.push(id);

  return id;
}

/** A published article of the store, titled in Spanish (and English). */
async function makeArticle(
  storeId: number,
  {
    priceAmount = 1000,
    publish = true,
    title,
    titleEn,
  }: {
    priceAmount?: number | null;
    publish?: boolean;
    title: string;
    titleEn?: string;
  }
) {
  const created = await createProduct(db, {
    storeId,
    values: {
      categoryId: await categoryOf(storeId),
      isAvailable: true,
      priceAmount,
      translations: [
        {
          description: "",
          locale: "es",
          seoDescription: null,
          seoTitle: null,
          title,
        },
        ...(titleEn
          ? [
              {
                description: "",
                locale: "en" as const,
                seoDescription: null,
                seoTitle: null,
                title: titleEn,
              },
            ]
          : []),
      ],
    },
  });
  await db.insert(productImage).values({
    height: 100,
    position: 0,
    productId: created.id,
    url: "/seed/ring-1.jpg",
    width: 100,
  });

  if (publish) {
    await publishProduct(db, { id: created.id, storeId });
  }

  return created;
}

/** An order's input, one of `productId` unless `items` says otherwise. */
/**
 * A Uruguayan mobile no other test, and no row the database was copied with,
 * is likely to hold: the phone limit counts orders across every store, so a
 * limit test with a shared number would count someone else's orders.
 */
function uniquePhone() {
  return `+5989${String(randomInt(10_000_000)).padStart(7, "0")}`;
}

function orderValues(
  overrides: Partial<Parameters<typeof createOrder>[1]["values"]> & {
    productId?: number;
  } = {}
) {
  const { productId = 0, ...rest } = overrides;

  return {
    customerName: "Ana",
    customerPhone: "+59899123456",
    items: [{ productId, quantity: 1 }],
    locale: "es" as const,
    note: null,
    requestKey: randomUUID(),
    ...rest,
  };
}

async function place(
  shop: { id: number },
  values: ReturnType<typeof orderValues>,
  { clientKey = null, now }: { clientKey?: string | null; now?: Date } = {}
) {
  return await createOrder(db, {
    clientKey,
    now,
    storeId: shop.id,
    values,
  });
}

async function orderRow(token: string) {
  const [row] = await db
    .select()
    .from(customerOrder)
    .where(eq(customerOrder.token, token));

  if (!row) {
    throw new Error("The order was not written");
  }

  return row;
}

describe("creating an order", () => {
  test("prices every item from the database, copies the store's currency and starts as received", async () => {
    const shop = await makeStore("USD");
    const ring = await makeArticle(shop.id, {
      priceAmount: 1250,
      title: "Anillo",
      titleEn: "Ring",
    });
    const chain = await makeArticle(shop.id, {
      priceAmount: 800,
      title: "Cadena",
    });

    const created = await place(
      shop,
      orderValues({
        customerName: "Ana",
        items: [
          { productId: ring.id, quantity: 2 },
          { productId: chain.id, quantity: 3 },
        ],
        locale: "en",
        note: "Paso a las 18",
      })
    );

    expect(created.token).toMatch(ORDER_TOKEN_PATTERN);
    expect(created.code).toMatch(/^[2-9A-HJ-NP-Z]{5}$/u);
    const row = await orderRow(created.token);
    expect(row).toMatchObject({
      code: created.code,
      currencyCode: "USD",
      customerName: "Ana",
      customerPhone: "+59899123456",
      locale: "en",
      note: "Paso a las 18",
      phoneVerifiedAt: null,
      status: "received",
      totalAmount: 2 * 1250 + 3 * 800,
    });
    expect(
      await db
        .select({
          productId: orderItem.productId,
          quantity: orderItem.quantity,
          title: orderItem.title,
          unitPriceAmount: orderItem.unitPriceAmount,
        })
        .from(orderItem)
        .where(eq(orderItem.orderId, row.id))
        .orderBy(orderItem.id)
    ).toEqual([
      // Titled in the order's language, or Spanish when it has none.
      { productId: ring.id, quantity: 2, title: "Ring", unitPriceAmount: 1250 },
      {
        productId: chain.id,
        quantity: 3,
        title: "Cadena",
        unitPriceAmount: 800,
      },
    ]);
    expect(
      await db
        .select({
          changedById: orderStatusEvent.changedById,
          status: orderStatusEvent.status,
        })
        .from(orderStatusEvent)
        .where(eq(orderStatusEvent.orderId, row.id))
    ).toEqual([{ changedById: null, status: "received" }]);
  });

  test.each<
    [
      string,
      "BAD_REQUEST" | "NOT_FOUND",
      string,
      (storeId: number) => Promise<number>,
    ]
  >([
    [
      "another store's article",
      "NOT_FOUND",
      "Article not found",
      async () =>
        (await makeArticle((await makeStore()).id, { title: "Ajeno" })).id,
    ],
    [
      "a draft",
      "NOT_FOUND",
      "Article not found",
      async (storeId) =>
        (await makeArticle(storeId, { publish: false, title: "Borrador" })).id,
    ],
    [
      "an article that does not exist",
      "NOT_FOUND",
      "Article not found",
      async () => await Promise.resolve(2_000_000_000),
    ],
    [
      "an unavailable article",
      "BAD_REQUEST",
      "Article not available",
      async (storeId) => {
        const { id } = await makeArticle(storeId, { title: "Agotado" });
        await db
          .update(product)
          .set({ isAvailable: false })
          .where(eq(product.id, id));

        return id;
      },
    ],
  ])("refuses %s, writing nothing", async (_kind, code, message, make) => {
    const shop = await makeStore();
    const fine = await makeArticle(shop.id, { title: "Bien" });
    const productId = await make(shop.id);

    await expect(
      place(
        shop,
        orderValues({
          items: [
            { productId: fine.id, quantity: 1 },
            { productId, quantity: 1 },
          ],
        })
      )
    ).rejects.toMatchObject({ code, message });
    expect(
      await db
        .select({ id: customerOrder.id })
        .from(customerOrder)
        .where(eq(customerOrder.storeId, shop.id))
    ).toEqual([]);
  });

  test("refuses a total past what an order can hold", async () => {
    const shop = await makeStore();
    const items = await Promise.all(
      Array.from({ length: 3 }, async (_, index) => ({
        productId: (
          await makeArticle(shop.id, {
            priceAmount: 99_999_999,
            title: `Caro ${index}`,
          })
        ).id,
        quantity: 10,
      }))
    );

    await expect(place(shop, orderValues({ items }))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Order total too large",
    });
  });

  test("an order's items keep their title and price after the article is edited or deleted", async () => {
    const shop = await makeStore();
    const ring = await makeArticle(shop.id, {
      priceAmount: 1500,
      title: "Anillo",
    });
    const chain = await makeArticle(shop.id, {
      priceAmount: 900,
      title: "Cadena",
    });
    const { token } = await place(
      shop,
      orderValues({
        items: [
          { productId: ring.id, quantity: 1 },
          { productId: chain.id, quantity: 1 },
        ],
      })
    );

    await db
      .update(product)
      .set({ priceAmount: 9999 })
      .where(eq(product.id, ring.id));
    await db
      .update(productTranslation)
      .set({ title: "Anillo nuevo" })
      .where(eq(productTranslation.productId, ring.id));
    await db.delete(product).where(eq(product.id, chain.id));

    const order = await getOrderByToken(db, { storeId: shop.id, token });
    expect(order.items).toEqual([
      { quantity: 1, title: "Anillo", unitPriceAmount: 1500 },
      { quantity: 1, title: "Cadena", unitPriceAmount: 900 },
    ]);
    expect(order.totalAmount).toBe(2400);
  });

  test("the same request key again answers the order it created, writing one", async () => {
    const shop = await makeStore();
    const ring = await makeArticle(shop.id, { title: "Anillo" });
    const values = orderValues({ productId: ring.id });

    const first = await place(shop, values);
    const again = await place(shop, { ...values, customerName: "Otra" });

    expect(again).toEqual(first);
    expect(
      await db
        .select({ name: customerOrder.customerName })
        .from(customerOrder)
        .where(eq(customerOrder.storeId, shop.id))
    ).toEqual([{ name: "Ana" }]);
  });
});

test("a request key reused with another phone is refused, never answered with that order", async () => {
  const shop = await makeStore();
  const ring = await makeArticle(shop.id, { title: "Anillo" });
  const values = orderValues({ productId: ring.id });
  await place(shop, values);

  await expect(
    place(shop, { ...values, customerPhone: "+59899000222" })
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "That request was already used for another order",
  });
});

test("an order is stamped by the database's clock, and its first event with it", async () => {
  const shop = await makeStore();
  const ring = await makeArticle(shop.id, { title: "Anillo" });
  const before = await db.execute<{ now: string }>(
    sql`select clock_timestamp() as now`
  );

  const { token } = await place(shop, orderValues({ productId: ring.id }));

  const row = await orderRow(token);
  expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(
    new Date(before.rows[0]?.now ?? 0).getTime()
  );
  const [event] = await db
    .select({ createdAt: orderStatusEvent.createdAt })
    .from(orderStatusEvent)
    .where(eq(orderStatusEvent.orderId, row.id));
  expect(event?.createdAt).toEqual(row.createdAt);
});

test("a store deactivated before the order took its lock takes no order", async () => {
  const shop = await makeStore();
  const ring = await makeArticle(shop.id, { title: "Anillo" });
  await db.update(store).set({ isActive: false }).where(eq(store.id, shop.id));
  const values = orderValues({ productId: ring.id });

  await expect(place(shop, values)).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "Store not found",
  });
  expect(
    await db
      .select({ id: customerOrder.id })
      .from(customerOrder)
      .where(
        and(
          eq(customerOrder.storeId, shop.id),
          eq(customerOrder.requestKey, values.requestKey)
        )
      )
  ).toEqual([]);
});

describe("abuse limits", () => {
  test("a phone places five orders an hour; the sixth waits for the oldest to leave the window", async () => {
    const shop = await makeStore();
    const ring = await makeArticle(shop.id, { title: "Anillo" });
    const start = new Date();
    const customerPhone = uniquePhone();

    for (let minute = 0; minute < 5; minute += 1) {
      await place(shop, orderValues({ customerPhone, productId: ring.id }), {
        now: new Date(start.getTime() + minute * 60_000),
      });
    }

    const rows = await db
      .select({ createdAt: customerOrder.createdAt })
      .from(customerOrder)
      .where(eq(customerOrder.storeId, shop.id))
      .orderBy(customerOrder.createdAt);
    const oldest = rows[0]?.createdAt ?? start;
    const sixth = new Date(oldest.getTime() + 50 * 60_000);

    await expect(
      place(shop, orderValues({ customerPhone, productId: ring.id }), {
        now: sixth,
      })
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      data: { retryAfter: 10 * 60 },
      message: "Too many orders for now",
    });
    // Another phone is not held back by this one.
    await expect(
      place(
        shop,
        orderValues({ customerPhone: uniquePhone(), productId: ring.id }),
        { now: sixth }
      )
    ).resolves.toMatchObject({
      token: expect.stringMatching(ORDER_TOKEN_PATTERN),
    });
  });

  test("an hour after the oldest order, the phone can order again", async () => {
    const shop = await makeStore();
    const ring = await makeArticle(shop.id, { title: "Anillo" });
    const customerPhone = uniquePhone();

    for (let order = 0; order < 5; order += 1) {
      await place(shop, orderValues({ customerPhone, productId: ring.id }));
    }

    await expect(
      place(shop, orderValues({ customerPhone, productId: ring.id }), {
        now: new Date(Date.now() + 60 * 60_000 + 1000),
      })
    ).resolves.toMatchObject({
      token: expect.stringMatching(ORDER_TOKEN_PATTERN),
    });
  });

  test("a client places twenty orders an hour across phones; the twenty-first is refused", async () => {
    const shop = await makeStore();
    const ring = await makeArticle(shop.id, { title: "Anillo" });
    const clientKey = `client-${randomUUID()}`;

    for (let order = 0; order < 20; order += 1) {
      await place(
        shop,
        orderValues({
          customerPhone: uniquePhone(),
          productId: ring.id,
        }),
        { clientKey }
      );
    }

    await expect(
      place(
        shop,
        orderValues({ customerPhone: uniquePhone(), productId: ring.id }),
        { clientKey }
      )
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // A client the platform gave no IP for is never one shared bucket.
    await expect(
      place(
        shop,
        orderValues({ customerPhone: uniquePhone(), productId: ring.id }),
        { clientKey: null }
      )
    ).resolves.toMatchObject({
      token: expect.stringMatching(ORDER_TOKEN_PATTERN),
    });
  });
});

describe("reading an order", () => {
  test("the public page has the masked phone and no internal id, only in its own store", async () => {
    const shop = await makeStore();
    const other = await makeStore();
    const ring = await makeArticle(shop.id, {
      priceAmount: 700,
      title: "Anillo",
    });
    const { code, token } = await place(
      shop,
      orderValues({ productId: ring.id })
    );

    const order = await getOrderByToken(db, { storeId: shop.id, token });

    expect(order).toEqual({
      code,
      createdAt: expect.any(Date),
      currencyCode: "UYU",
      customerName: "Ana",
      customerPhone: "+598•••••456",
      items: [{ quantity: 1, title: "Anillo", unitPriceAmount: 700 }],
      note: null,
      phoneVerified: false,
      status: "received",
      totalAmount: 700,
    });
    await expect(
      getOrderByToken(db, { storeId: other.id, token })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Order not found" });
  });

  test("store A's orders are invisible to store B: list, read and move", async () => {
    const shopA = await makeStore();
    const shopB = await makeStore();
    const ring = await makeArticle(shopA.id, { title: "Anillo" });
    const { token } = await place(shopA, orderValues({ productId: ring.id }));
    const { id } = await orderRow(token);
    const memberB = await makeUser("Bea");

    expect((await listOrders(db, { storeId: shopB.id })).items).toEqual([]);
    await expect(getOrder(db, { id, storeId: shopB.id })).rejects.toMatchObject(
      {
        code: "NOT_FOUND",
        message: "Order not found",
      }
    );
    await expect(
      db.transaction(
        async (tx) =>
          await changeOrderStatus(tx, {
            id,
            status: "packed",
            storeId: shopB.id,
            userId: memberB,
          })
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await orderRow(token)).status).toBe("received");
  });

  test("the list is newest first, filtered by status, and its cursor never repeats or skips", async () => {
    const shop = await makeStore();
    const ring = await makeArticle(shop.id, { title: "Anillo" });
    const member = await makeUser("Ana");
    const codes: string[] = [];

    for (let order = 0; order < 3; order += 1) {
      const created = await place(
        shop,
        orderValues({
          customerPhone: `+5989911100${order}`,
          productId: ring.id,
        })
      );
      codes.push(created.code);
    }

    const newest = await orderRow(
      (
        await db
          .select({ token: customerOrder.token })
          .from(customerOrder)
          .where(
            and(
              eq(customerOrder.storeId, shop.id),
              eq(customerOrder.code, codes[2] ?? "")
            )
          )
      )[0]?.token ?? ""
    );
    await db.transaction(
      async (tx) =>
        await changeOrderStatus(tx, {
          id: newest.id,
          status: "packed",
          storeId: shop.id,
          userId: member,
        })
    );

    const first = await listOrders(db, { limit: 2, storeId: shop.id });
    const second = await listOrders(db, {
      cursor: first.nextCursor ?? undefined,
      limit: 2,
      storeId: shop.id,
    });

    expect([...first.items, ...second.items].map((row) => row.code)).toEqual([
      codes[2],
      codes[1],
      codes[0],
    ]);
    expect(second.nextCursor).toBeNull();
    expect(
      (await listOrders(db, { status: "packed", storeId: shop.id })).items.map(
        (row) => row.code
      )
    ).toEqual([codes[2]]);
  });
});

describe("searching and counting the orders", () => {
  /** An order of `shop` with this name and phone, its code and status set. */
  async function makeOrder(
    shop: { id: number },
    {
      code,
      customerName = "Ana",
      customerPhone = "+59894000000",
      status = "received",
    }: {
      code?: string;
      customerName?: string;
      customerPhone?: string;
      status?: OrderStatus;
    } = {}
  ) {
    const ring = await makeArticle(shop.id, { title: "Anillo" });
    const created = await place(
      shop,
      orderValues({
        customerName,
        customerPhone,
        productId: ring.id,
      })
    );
    await db
      .update(customerOrder)
      .set({ code: code ?? created.code, status })
      .where(eq(customerOrder.token, created.token));
  }

  async function searched(
    shop: { id: number },
    q: string,
    status?: OrderStatus
  ) {
    const page = await listOrders(db, { q, status, storeId: shop.id });

    return page.items.map((row) => row.code);
  }

  test("a code prefix typed in lower case finds the order, a code holding it elsewhere does not", async () => {
    const shop = await makeStore();
    await makeOrder(shop, { code: "K7P2M" });
    await makeOrder(shop, { code: "XK7PA" });

    expect(await searched(shop, "k7p")).toEqual(["K7P2M"]);
  });

  test("a name typed without its accents finds it, in any case", async () => {
    const shop = await makeStore();
    await makeOrder(shop, { code: "HXR4Q", customerName: "José Martínez" });
    await makeOrder(shop, { code: "B9TNW", customerName: "Ana" });

    expect(await searched(shop, "jose")).toEqual(["HXR4Q"]);
    expect(await searched(shop, "MARTINEZ")).toEqual(["HXR4Q"]);
  });

  test("a phone typed locally finds the stored international number", async () => {
    const shop = await makeStore();
    await makeOrder(shop, { code: "M3N5P", customerPhone: "+59899123987" });
    await makeOrder(shop, { code: "R6S8T", customerPhone: "+59891234567" });

    expect(await searched(shop, "099 123")).toEqual(["M3N5P"]);
  });

  test("a search that matches nothing lists nothing, and % is taken literally", async () => {
    const shop = await makeStore();
    await makeOrder(shop, { customerName: "Ana" });

    await expect(
      listOrders(db, { q: "zzz", storeId: shop.id })
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(await searched(shop, "%")).toEqual([]);
  });

  test("_ is taken literally: it never stands for any one character", async () => {
    const shop = await makeStore();
    await makeOrder(shop, {
      code: "P2Q3R",
      customerName: "Ana Luz",
      customerPhone: uniquePhone(),
    });
    await makeOrder(shop, {
      code: "S4T5U",
      customerName: "Ana_Luz",
      customerPhone: uniquePhone(),
    });

    // Unescaped, "a_l" would match the "a L" in "Ana Luz" too.
    expect(await searched(shop, "a_l")).toEqual(["S4T5U"]);
  });

  test("\\ is taken literally: a name holding one is found by it, and only it", async () => {
    const shop = await makeStore();
    await makeOrder(shop, {
      code: "V6W7X",
      customerName: "Ana\\Luz",
      customerPhone: uniquePhone(),
    });
    await makeOrder(shop, {
      code: "Y8Z9A",
      customerName: "Ana Luz",
      customerPhone: uniquePhone(),
    });

    expect(await searched(shop, "\\")).toEqual(["V6W7X"]);
    expect(await searched(shop, "a\\l")).toEqual(["V6W7X"]);
  });

  test("a whole code typed is a code: a phone holding its digits does not match", async () => {
    const shop = await makeStore();
    let anaPhone = uniquePhone();

    // Ana's own phone must not hold them, or it would match for itself.
    while (anaPhone.includes("2345")) {
      anaPhone = uniquePhone();
    }

    await makeOrder(shop, {
      code: "A2345",
      customerName: "Ana",
      customerPhone: anaPhone,
    });
    // Its phone holds the code's digits, 2345.
    await makeOrder(shop, {
      code: "B6789",
      customerName: "Beto",
      customerPhone: `+5989${String(randomInt(1000)).padStart(3, "0")}2345`,
    });

    expect(await searched(shop, "a2345")).toEqual(["A2345"]);
  });

  test("a phone typed in its 00 international form finds the stored +598 number", async () => {
    const shop = await makeStore();
    const digits = String(randomInt(1_000_000)).padStart(6, "0");
    await makeOrder(shop, {
      code: "C2D4F",
      customerName: "Ana",
      customerPhone: `+59899${digits}`,
    });
    // Another 598 phone, never 59899…: the typed digits are not in it.
    await makeOrder(shop, {
      code: "G3H5J",
      customerName: "Beto",
      customerPhone: `+59891${digits}`,
    });

    expect(await searched(shop, `00598 99 ${digits.slice(0, 3)}`)).toEqual([
      "C2D4F",
    ]);
  });

  test("a search narrows within a status", async () => {
    const shop = await makeStore();
    await makeOrder(shop, { code: "C2D3E", customerName: "Lucía" });
    await makeOrder(shop, {
      code: "F4G5H",
      customerName: "Lucía",
      status: "packed",
    });
    await makeOrder(shop, {
      code: "J6K7M",
      customerName: "Ana",
      status: "packed",
    });

    expect(await searched(shop, "lucia")).toEqual(["F4G5H", "C2D3E"]);
    expect(await searched(shop, "lucia", "packed")).toEqual(["F4G5H"]);
  });

  test("another store's orders never match", async () => {
    const shopA = await makeStore();
    const shopB = await makeStore();
    await makeOrder(shopA, {
      code: "N8P9Q",
      customerName: "José",
      customerPhone: "+59899123987",
    });
    await makeOrder(shopB, {
      code: "N8P9R",
      customerName: "José",
      customerPhone: "+59899123987",
    });

    expect(await searched(shopA, "jose")).toEqual(["N8P9Q"]);
    expect(await searched(shopA, "099 123")).toEqual(["N8P9Q"]);
    expect(await searched(shopA, "n8p9")).toEqual(["N8P9Q"]);
  });

  test("counts the store's orders in each status, 0 where none, another store's left out", async () => {
    const shop = await makeStore();
    const other = await makeStore();
    const empty = await makeStore();
    const statuses: OrderStatus[] = [
      "received",
      "received",
      "received",
      "packed",
      "delivered",
      "delivered",
    ];

    // A phone each: one phone's hourly limit would stop the sixth.
    for (const [index, status] of statuses.entries()) {
      await makeOrder(shop, {
        customerPhone: `+5989400010${String(index)}`,
        status,
      });
    }

    await makeOrder(other, { status: "undeliverable" });
    await makeOrder(other, { status: "packed" });

    await expect(countOrders(db, { storeId: shop.id })).resolves.toEqual({
      delivered: 2,
      packed: 1,
      received: 3,
      undeliverable: 0,
    });
    await expect(countOrders(db, { storeId: empty.id })).resolves.toEqual({
      delivered: 0,
      packed: 0,
      received: 0,
      undeliverable: 0,
    });
  });
});

describe("status moves", () => {
  const allowed: [OrderStatus, OrderStatus][] = [
    ["received", "packed"],
    ["packed", "delivered"],
    ["packed", "undeliverable"],
    ["packed", "received"],
    ["delivered", "packed"],
    ["undeliverable", "packed"],
  ];
  const refused = ORDER_STATUSES.flatMap((from) =>
    ORDER_STATUSES.filter(
      (to) =>
        !allowed.some(
          ([allowedFrom, allowedTo]) => allowedFrom === from && allowedTo === to
        )
    ).map((to): [OrderStatus, OrderStatus] => [from, to])
  );

  /** An order of a new store, put in `status` directly, and a member. */
  async function setup(status: OrderStatus) {
    const shop = await makeStore();
    const ring = await makeArticle(shop.id, { title: "Anillo" });
    const { token } = await place(shop, orderValues({ productId: ring.id }));
    const { id } = await orderRow(token);
    await db
      .update(customerOrder)
      .set({ status })
      .where(eq(customerOrder.id, id));
    const member = await makeUser("Mara");

    return { id, member, shop, token };
  }

  const move = async (
    { id, member, shop }: Awaited<ReturnType<typeof setup>>,
    status: OrderStatus
  ) =>
    await db.transaction(
      async (tx) =>
        await changeOrderStatus(tx, {
          id,
          status,
          storeId: shop.id,
          userId: member,
        })
    );

  test.each(allowed)(
    "%s → %s is allowed and recorded with who did it",
    async (from, to) => {
      const order = await setup(from);

      await expect(move(order, to)).resolves.toEqual({
        id: order.id,
        status: to,
      });
      expect((await orderRow(order.token)).status).toBe(to);
      const { history } = await getOrder(db, {
        id: order.id,
        storeId: order.shop.id,
      });
      expect(history.at(-1)).toMatchObject({
        changedByName: "Mara",
        status: to,
      });
    }
  );

  test.each(refused)(
    "%s → %s is refused, changing nothing",
    async (from, to) => {
      const order = await setup(from);
      const before = (
        await getOrder(db, { id: order.id, storeId: order.shop.id })
      ).history;

      await expect(move(order, to)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "That status change is not allowed",
      });
      expect((await orderRow(order.token)).status).toBe(from);
      expect(
        (await getOrder(db, { id: order.id, storeId: order.shop.id })).history
      ).toEqual(before);
    }
  );
});

describe("one client ordering in two stores at once", () => {
  test("the second waits for the first's client lock, so the hourly count is never read stale", async () => {
    const [storeA, storeB] = [await makeStore(), await makeStore()];
    const ringA = await makeArticle(storeA.id, { title: "Anillo" });
    const ringB = await makeArticle(storeB.id, { title: "Anillo" });
    const clientKey = `client-${randomUUID()}`;
    const held = deferred();
    const written = deferred();
    const firstPid = deferred<number>();
    const secondPid = deferred<number>();
    const writers: Promise<unknown>[] = [];
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await Promise.allSettled(writers)
    );

    const first = db.transaction(async (tx) => {
      firstPid.resolve(await backendPid(tx));
      const created = await createOrder(tx, {
        clientKey,
        storeId: storeA.id,
        values: orderValues({ productId: ringA.id }),
      });
      written.resolve(undefined);
      await held.promise;

      return created;
    });
    writers.push(first);
    await readyOrFailed(written.promise, first);
    // Another phone and another store: only the client's lock is shared.
    const second = db.transaction(async (tx) => {
      secondPid.resolve(await backendPid(tx));

      return await createOrder(tx, {
        clientKey,
        storeId: storeB.id,
        values: orderValues({
          customerPhone: "+59899000333",
          productId: ringB.id,
        }),
      });
    });
    writers.push(second);

    try {
      await waitUntilAdvisoryBlocked(
        db,
        await readyOrFailed(secondPid.promise, second),
        await readyOrFailed(firstPid.promise, first)
      );
    } finally {
      held.resolve(undefined);
      await Promise.allSettled([first, second]);
    }

    await expect(second).resolves.toMatchObject({
      token: expect.stringMatching(ORDER_TOKEN_PATTERN),
    });
  });
});

describe("an order and a currency change at once", () => {
  test("the change waits for the order, which keeps the currency its prices were read in", async () => {
    const shop = await makeStore("UYU");
    const ring = await makeArticle(shop.id, {
      priceAmount: 1000,
      title: "Anillo",
    });
    const held = deferred();
    const written = deferred();
    const orderPid = deferred<number>();
    const changePid = deferred<number>();
    const writers: Promise<unknown>[] = [];
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await Promise.allSettled(writers)
    );

    const order = db.transaction(async (tx) => {
      orderPid.resolve(await backendPid(tx));
      const created = await createOrder(tx, {
        clientKey: null,
        storeId: shop.id,
        values: orderValues({ productId: ring.id }),
      });
      written.resolve(undefined);
      await held.promise;

      return created;
    });
    writers.push(order);
    await readyOrFailed(written.promise, order);
    const change = db.transaction(async (tx) => {
      changePid.resolve(await backendPid(tx));
      await tx
        .update(store)
        .set({ currencyCode: "USD" })
        .where(eq(store.id, shop.id));
    });
    writers.push(change);

    try {
      await waitUntilBlockedBy(
        db,
        await readyOrFailed(changePid.promise, change),
        await readyOrFailed(orderPid.promise, order)
      );
    } finally {
      held.resolve(undefined);
      await Promise.allSettled([order, change]);
    }

    const { token } = await order;
    expect((await orderRow(token)).currencyCode).toBe("UYU");
    const [after] = await db
      .select({ currencyCode: store.currencyCode })
      .from(store)
      .where(eq(store.id, shop.id));
    expect(after?.currencyCode).toBe("USD");
  });
});

describe("one submit sent twice at once", () => {
  test("the second waits for the first's lock and answers the same order", async () => {
    const shop = await makeStore();
    const ring = await makeArticle(shop.id, { title: "Anillo" });
    const values = orderValues({ productId: ring.id });
    const held = deferred();
    const written = deferred();
    const firstPid = deferred<number>();
    const secondPid = deferred<number>();
    const writers: Promise<unknown>[] = [];
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await Promise.allSettled(writers)
    );
    const submit = async (tx: DatabaseClient) =>
      await createOrder(tx, {
        clientKey: null,
        storeId: shop.id,
        values,
      });

    const first = db.transaction(async (tx) => {
      firstPid.resolve(await backendPid(tx));
      const created = await submit(tx);
      written.resolve(undefined);
      await held.promise;

      return created;
    });
    writers.push(first);
    await readyOrFailed(written.promise, first);
    const second = db.transaction(async (tx) => {
      secondPid.resolve(await backendPid(tx));

      return await submit(tx);
    });
    writers.push(second);

    try {
      await waitUntilAdvisoryBlocked(
        db,
        await readyOrFailed(secondPid.promise, second),
        await readyOrFailed(firstPid.promise, first)
      );
    } finally {
      held.resolve(undefined);
      await Promise.allSettled([first, second]);
    }

    expect(await second).toEqual(await first);
    expect(
      await db
        .select({ id: customerOrder.id })
        .from(customerOrder)
        .where(eq(customerOrder.storeId, shop.id))
    ).toHaveLength(1);
  });
});
