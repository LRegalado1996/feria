import { randomUUID } from "node:crypto";

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
  releaseHeldWriters,
  releaseOnTeardown,
  waitUntilAdvisoryBlocked,
} from "@/server/test/two-writers";

import {
  changeOrderStatus,
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
  releaseHeldWriters();
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
  shop: { currencyCode: "UYU" | "USD"; id: number },
  values: ReturnType<typeof orderValues>,
  { clientKey = null, now }: { clientKey?: string | null; now?: Date } = {}
) {
  return await createOrder(db, {
    clientKey,
    currencyCode: shop.currencyCode,
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

describe("abuse limits", () => {
  test("a phone places five orders an hour; the sixth waits for the oldest to leave the window", async () => {
    const shop = await makeStore();
    const ring = await makeArticle(shop.id, { title: "Anillo" });
    const start = new Date();

    for (let minute = 0; minute < 5; minute += 1) {
      await place(shop, orderValues({ productId: ring.id }), {
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
      place(shop, orderValues({ productId: ring.id }), { now: sixth })
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      data: { retryAfter: 10 * 60 },
      message: "Too many orders for now",
    });
    // Another phone is not held back by this one.
    await expect(
      place(
        shop,
        orderValues({ customerPhone: "+59899000111", productId: ring.id }),
        { now: sixth }
      )
    ).resolves.toMatchObject({
      token: expect.stringMatching(ORDER_TOKEN_PATTERN),
    });
  });

  test("an hour after the oldest order, the phone can order again", async () => {
    const shop = await makeStore();
    const ring = await makeArticle(shop.id, { title: "Anillo" });

    for (let order = 0; order < 5; order += 1) {
      await place(shop, orderValues({ productId: ring.id }));
    }

    await expect(
      place(shop, orderValues({ productId: ring.id }), {
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
          customerPhone: `+5989900${String(order).padStart(4, "0")}`,
          productId: ring.id,
        }),
        { clientKey }
      );
    }

    await expect(
      place(
        shop,
        orderValues({ customerPhone: "+59899999999", productId: ring.id }),
        { clientKey }
      )
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // A client the platform gave no IP for is never one shared bucket.
    await expect(
      place(
        shop,
        orderValues({ customerPhone: "+59899999999", productId: ring.id }),
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
    releaseOnTeardown(() => {
      held.resolve(undefined);
    });

    const first = db.transaction(async (tx) => {
      firstPid.resolve(await backendPid(tx));
      const created = await createOrder(tx, {
        clientKey,
        currencyCode: "UYU",
        storeId: storeA.id,
        values: orderValues({ productId: ringA.id }),
      });
      written.resolve(undefined);
      await held.promise;

      return created;
    });
    await written.promise;
    // Another phone and another store: only the client's lock is shared.
    const second = db.transaction(async (tx) => {
      secondPid.resolve(await backendPid(tx));

      return await createOrder(tx, {
        clientKey,
        currencyCode: "UYU",
        storeId: storeB.id,
        values: orderValues({
          customerPhone: "+59899000333",
          productId: ringB.id,
        }),
      });
    });

    try {
      await waitUntilAdvisoryBlocked(
        db,
        await secondPid.promise,
        await firstPid.promise
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

describe("one submit sent twice at once", () => {
  test("the second waits for the first's lock and answers the same order", async () => {
    const shop = await makeStore();
    const ring = await makeArticle(shop.id, { title: "Anillo" });
    const values = orderValues({ productId: ring.id });
    const held = deferred();
    const written = deferred();
    const firstPid = deferred<number>();
    const secondPid = deferred<number>();
    releaseOnTeardown(() => {
      held.resolve(undefined);
    });
    const submit = async (tx: DatabaseClient) =>
      await createOrder(tx, {
        clientKey: null,
        currencyCode: "UYU",
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
    await written.promise;
    const second = db.transaction(async (tx) => {
      secondPid.resolve(await backendPid(tx));

      return await submit(tx);
    });

    try {
      await waitUntilAdvisoryBlocked(
        db,
        await secondPid.promise,
        await firstPid.promise
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
