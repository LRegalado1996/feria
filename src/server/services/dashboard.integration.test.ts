import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { OrderStatus } from "@/lib/schemas/order";
import { db } from "@/server/db";
import {
  category,
  customerOrder,
  orderItem,
  product,
  productTranslation,
  productViewDaily,
  session,
  storeVisitDaily,
  user,
} from "@/server/db/schema";
import { theStoreId, uniqueTag } from "@/server/test/one-store";

import { getDashboard } from "./dashboard";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// A week no real row holds: every count, view and order of these days is
// this file's, so the store-wide numbers of the range are known answers.
const RANGE = { from: "2032-06-01", to: "2032-06-07" };

// The store is shared (`theStoreId`): what this file created is deleted by
// id after each test. An article takes its texts and views with it, an
// order its lines, a login its sessions.
const created = {
  categoryIds: [] as number[],
  orderIds: [] as number[],
  productIds: [] as number[],
  userIds: [] as string[],
  visitIds: [] as number[],
};

afterEach(async () => {
  await db
    .delete(customerOrder)
    .where(inArray(customerOrder.id, created.orderIds.splice(0)));
  await db
    .delete(product)
    .where(inArray(product.id, created.productIds.splice(0)));
  await db
    .delete(category)
    .where(inArray(category.id, created.categoryIds.splice(0)));
  await db.delete(user).where(inArray(user.id, created.userIds.splice(0)));
  await db
    .delete(storeVisitDaily)
    .where(inArray(storeVisitDaily.id, created.visitIds.splice(0)));
});

/** An article of the store, created at `createdAt`, titled per language. */
async function makeArticle(
  storeId: number,
  {
    createdAt = new Date("2032-06-01T15:00:00Z"),
    isAvailable = true,
    published = true,
    titles,
  }: {
    createdAt?: Date;
    isAvailable?: boolean;
    published?: boolean;
    titles: { en?: string; es: string };
  }
) {
  const tag = uniqueTag();
  const [group] = await db
    .insert(category)
    .values({ position: 0, slug: `tablero-${tag}`, storeId })
    .returning({ id: category.id });

  if (!group) {
    throw new Error("The category was not created");
  }

  created.categoryIds.push(group.id);
  const [row] = await db
    .insert(product)
    .values({
      categoryId: group.id,
      createdAt,
      isAvailable,
      priceAmount: 1000,
      slug: `articulo-${tag}`,
      storeId,
      ...(published
        ? { publishedAt: createdAt, status: "published" as const }
        : {}),
    })
    .returning({ id: product.id });

  if (!row) {
    throw new Error("The article was not created");
  }

  created.productIds.push(row.id);
  await db.insert(productTranslation).values([
    { description: "", locale: "es", productId: row.id, title: titles.es },
    ...(titles.en
      ? [
          {
            description: "",
            locale: "en" as const,
            productId: row.id,
            title: titles.en,
          },
        ]
      : []),
  ]);

  return row.id;
}

/** An order placed at `at`, holding `items`. */
async function makeOrder(
  storeId: number,
  {
    at,
    currencyCode = "UYU",
    items = [],
    status = "received",
    totalAmount,
  }: {
    at: string;
    currencyCode?: "USD" | "UYU";
    items?: { productId: number; quantity: number }[];
    status?: OrderStatus;
    totalAmount: number;
  }
) {
  const [order] = await db
    .insert(customerOrder)
    .values({
      code: randomUUID().slice(0, 8),
      createdAt: new Date(at),
      currencyCode,
      customerName: "Ana",
      customerPhone: "+59899123456",
      locale: "es",
      requestKey: randomUUID(),
      status,
      storeId,
      token: randomUUID(),
      totalAmount,
    })
    .returning({ id: customerOrder.id });

  if (!order) {
    throw new Error("The order was not created");
  }

  created.orderIds.push(order.id);

  if (items.length > 0) {
    await db.insert(orderItem).values(
      items.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        title: "Copiado",
        unitPriceAmount: 1000,
      }))
    );
  }
}

/** A login, signed in at each of `signIns`. */
async function makeLogin(
  name: string,
  signIns: string[],
  disabledAt: Date | null = null
): Promise<string> {
  const id: string = randomUUID();
  await db.insert(user).values({
    disabledAt,
    email: `${id}@example.com`,
    emailVerified: true,
    id,
    name,
  });
  created.userIds.push(id);

  for (const at of signIns) {
    await db.insert(session).values({
      createdAt: new Date(at),
      expiresAt: new Date("2040-01-01T00:00:00Z"),
      id: randomUUID(),
      token: randomUUID(),
      updatedAt: new Date(at),
      userId: id,
    });
  }

  return id;
}

/**
 * The seeded week (all times UTC; Montevideo is UTC-3):
 * - a ring (es "Anillo", en "Ring") viewed 5 then 3 times, ordered 2 + 1;
 * - a chain (es "Cadena" only), out of stock, viewed 4 times, ordered 3;
 * - an earring viewed once and never ordered, created the next week;
 * - a draft, and views and orders just outside the range, which count
 *   nothing;
 * - visits of 10 and 2 on two days.
 */
async function setup({
  logins = [],
}: {
  /** Logins to seed, each with the instants it signed in at. */
  logins?: { disabledAt?: Date; name: string; signIns: string[] }[];
} = {}) {
  const storeId = await theStoreId(db);
  const read = async (range: { from: string; to: string } = RANGE) =>
    await getDashboard(db, { ...range, locale: "es", storeId });
  // The store's catalog as it was, before this test's articles.
  const catalogBefore = (await read()).catalog;
  const loginIds: string[] = [];

  for (const login of logins) {
    loginIds.push(
      await makeLogin(login.name, login.signIns, login.disabledAt ?? null)
    );
  }

  const ring = await makeArticle(storeId, {
    titles: { en: "Ring", es: "Anillo" },
  });
  const chain = await makeArticle(storeId, {
    isAvailable: false,
    titles: { es: "Cadena" },
  });
  const earring = await makeArticle(storeId, {
    createdAt: new Date("2032-06-07T15:00:00Z"),
    titles: { es: "Aro" },
  });
  // Created the day before the range: no week of the range holds it.
  const draft = await makeArticle(storeId, {
    createdAt: new Date("2032-05-31T15:00:00Z"),
    published: false,
    titles: { es: "Borrador" },
  });

  await db.insert(productViewDaily).values([
    { day: "2032-06-01", productId: ring, storeId, viewCount: 5 },
    { day: "2032-06-02", productId: ring, storeId, viewCount: 3 },
    { day: "2032-06-02", productId: chain, storeId, viewCount: 4 },
    { day: "2032-06-03", productId: earring, storeId, viewCount: 1 },
    // The day before the range.
    { day: "2032-05-31", productId: draft, storeId, viewCount: 50 },
  ]);
  const visits = await db
    .insert(storeVisitDaily)
    .values([
      { day: "2032-05-31", storeId, visitCount: 99 },
      { day: "2032-06-01", storeId, visitCount: 10 },
      { day: "2032-06-03", storeId, visitCount: 2 },
    ])
    .returning({ id: storeVisitDaily.id });
  created.visitIds.push(...visits.map((visit) => visit.id));

  // Midnight in Montevideo opens the range...
  await makeOrder(storeId, {
    at: "2032-06-01T03:00:00.000Z",
    totalAmount: 1000,
  });
  // ...and the instant before it is the day before.
  await makeOrder(storeId, {
    at: "2032-06-01T02:59:59.999Z",
    items: [{ productId: earring, quantity: 9 }],
    totalAmount: 9000,
  });
  await makeOrder(storeId, {
    at: "2032-06-01T15:00:00.000Z",
    items: [{ productId: ring, quantity: 2 }],
    status: "delivered",
    totalAmount: 3000,
  });
  // 23:30 on June 2 in Montevideo, already June 3 in UTC.
  await makeOrder(storeId, {
    at: "2032-06-03T02:30:00.000Z",
    currencyCode: "USD",
    items: [{ productId: ring, quantity: 1 }],
    status: "undeliverable",
    totalAmount: 1500,
  });
  // The range's last instant, then the first one past it.
  await makeOrder(storeId, {
    at: "2032-06-08T02:59:59.999Z",
    items: [{ productId: chain, quantity: 3 }],
    totalAmount: 2000,
  });
  await makeOrder(storeId, {
    at: "2032-06-08T03:00:00.000Z",
    items: [{ productId: earring, quantity: 9 }],
    totalAmount: 9000,
  });

  return {
    catalogBefore,
    chain,
    draft,
    earring,
    loginIds,
    read,
    ring,
    storeId,
  };
}

describe("getDashboard", () => {
  test("adds up the range's views, visits and orders, business days in Montevideo, both ends included", async () => {
    const { storeId } = await setup();

    const dashboard = await getDashboard(db, {
      ...RANGE,
      locale: "es",
      storeId,
    });

    expect(dashboard.funnel).toEqual({ orders: 4, views: 13, visits: 12 });
    expect(dashboard.traffic).toEqual([
      { day: "2032-06-01", views: 5, visits: 10 },
      { day: "2032-06-02", views: 7, visits: 0 },
      { day: "2032-06-03", views: 1, visits: 2 },
    ]);
    expect(dashboard.orders.byDay).toEqual([
      { amount: 4000, currencyCode: "UYU", day: "2032-06-01", orders: 2 },
      { amount: 1500, currencyCode: "USD", day: "2032-06-02", orders: 1 },
      { amount: 2000, currencyCode: "UYU", day: "2032-06-07", orders: 1 },
    ]);
  });

  test("keeps each currency's totals and average apart, and splits the orders by status", async () => {
    const { storeId } = await setup();

    const { orders } = await getDashboard(db, {
      ...RANGE,
      locale: "es",
      storeId,
    });

    expect(orders.byCurrency).toEqual([
      { amount: 6000, average: 2000, currencyCode: "UYU", orders: 3 },
      { amount: 1500, average: 1500, currencyCode: "USD", orders: 1 },
    ]);
    expect(orders.byStatus).toEqual({
      delivered: 1,
      packed: 0,
      received: 2,
      undeliverable: 1,
    });
    expect(orders.undeliverableShare).toBe(0.25);
  });

  test("ranks the articles by views and by units, titled in the page's language or else the other one", async () => {
    const { chain, earring, ring, storeId } = await setup();

    const dashboard = await getDashboard(db, {
      ...RANGE,
      locale: "en",
      storeId,
    });

    expect(dashboard.topViewed).toEqual([
      { productId: ring, title: "Ring", units: 3, views: 8 },
      { productId: chain, title: "Cadena", units: 3, views: 4 },
      { productId: earring, title: "Aro", units: 0, views: 1 },
    ]);
    // The earring's only order came the instant before the range.
    expect(dashboard.viewedNotOrdered).toEqual([
      { productId: earring, title: "Aro", views: 1 },
    ]);
    // A tie in units goes to the older article.
    expect(dashboard.topOrdered).toEqual([
      { productId: ring, title: "Ring", units: 3 },
      { productId: chain, title: "Cadena", units: 3 },
    ]);
  });

  test("counts the articles created in each week of the range, weeks from Monday", async () => {
    const { storeId } = await setup();

    const { articlesPerWeek } = await getDashboard(db, {
      ...RANGE,
      locale: "es",
      storeId,
    });

    // June 1, 2032 is a Tuesday: its week began on Monday, May 31.
    expect(articlesPerWeek).toEqual([
      { created: 2, week: "2032-05-31" },
      { created: 1, week: "2032-06-07" },
    ]);
  });

  test("counts the store's articles as they are now, whatever the range", async () => {
    const { catalogBefore, read } = await setup();

    const { catalog } = await read();

    expect({
      draft: catalog.draft - catalogBefore.draft,
      published: catalog.published - catalogBefore.published,
      unavailable: catalog.unavailable - catalogBefore.unavailable,
    }).toEqual({ draft: 1, published: 2, unavailable: 1 });
  });

  test("dates each enabled login's last sign-in by its newest session, says never for one with none, and leaves a disabled one out", async () => {
    const {
      loginIds: [ana, beto, carla],
      read,
    } = await setup({
      logins: [
        {
          name: "Ana",
          signIns: ["2032-06-01T12:00:00.000Z", "2032-06-05T12:00:00.000Z"],
        },
        { name: "Beto", signIns: [] },
        // Disabled (FER-015): left out, whatever its sessions say.
        {
          disabledAt: new Date("2032-06-06T12:00:00.000Z"),
          name: "Carla",
          signIns: ["2032-06-06T10:00:00.000Z"],
        },
      ],
    });

    const { logins } = await read();
    const own = logins.filter((login) => [ana, beto, carla].includes(login.id));

    expect(own).toEqual([
      {
        email: `${ana}@example.com`,
        id: ana,
        lastSignInAt: new Date("2032-06-05T12:00:00.000Z"),
        name: "Ana",
      },
      {
        email: `${beto}@example.com`,
        id: beto,
        lastSignInAt: null,
        name: "Beto",
      },
    ]);
  });

  test("an empty range has nothing to show: no traffic, no orders, no rate", async () => {
    const { read } = await setup();

    const dashboard = await read({ from: "2032-07-01", to: "2032-07-31" });

    expect(dashboard.funnel).toEqual({ orders: 0, views: 0, visits: 0 });
    expect(dashboard.traffic).toEqual([]);
    expect(dashboard.orders).toEqual({
      byCurrency: [],
      byDay: [],
      byStatus: { delivered: 0, packed: 0, received: 0, undeliverable: 0 },
      undeliverableShare: null,
    });
    expect(dashboard.topViewed).toEqual([]);
    expect(dashboard.viewedNotOrdered).toEqual([]);
    expect(dashboard.topOrdered).toEqual([]);
    expect(dashboard.articlesPerWeek).toEqual([]);
  });
});
