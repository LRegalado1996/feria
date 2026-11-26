import { getTableName, is, Table } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { getDashboard } from "./dashboard";

// The numbers themselves are `dashboard.integration.test.ts`'s, against a
// seeded week with known answers. Here: the snapshot, the range's SQL, and
// how the rows each query answers become the dashboard.

const SCOPE = {
  from: "2026-12-01",
  locale: "en",
  storeId: 3,
  to: "2026-12-07",
} as const;

type Answers = Partial<Record<string, unknown[][]>>;

/**
 * What every dashboard reads, in order: the traffic (views, visits), the
 * viewed articles (the "no order holds it" subquery, the most viewed, those
 * never ordered), the orders (by day, by status, the most ordered), the
 * catalog, the weeks and the logins.
 */
const SNAPSHOT_READS = [
  "product_view_daily",
  "store_visit_daily",
  "order_item",
  "product_view_daily",
  "product_view_daily",
  "customer_order",
  "customer_order",
  "order_item",
  "product",
  "product",
  "user",
];

/**
 * The mock database answering each query by the table it reads, in the
 * order the service reads them: `answers[table]` is a queue of row sets.
 * Every step of a chain answers its query's rows, so whichever step comes
 * last resolves to them.
 */
function setup(answers: Answers = {}) {
  const db = createMockDatabase();
  // The snapshot's own handle: a read through the outer client instead
  // would get none of the answers, and show in `db.$.select`.
  const tx = createMockDatabase();
  db.$.transaction.mockImplementation(async (callback: unknown) =>
    typeof callback === "function" ? await callback(tx) : undefined
  );
  const queues = new Map(
    Object.entries(answers).map(([table, rows]) => [table, [...(rows ?? [])]])
  );
  let current: unknown[] = [];
  let currentTable = "";
  const filters: { table: string; where: unknown }[] = [];
  tx.$["select.from"].mockImplementation((table: unknown) => {
    currentTable = is(table, Table) ? getTableName(table) : "";
    current = queues.get(currentTable)?.shift() ?? [];

    return current;
  });
  tx.$["select.where"].mockImplementation((where: unknown) => {
    filters.push({ table: currentTable, where });

    return current;
  });

  const answer = () => current;

  for (const step of [
    tx.$["select.groupBy"],
    tx.$["select.innerJoin"],
    tx.$["select.leftJoin"],
    tx.$["select.limit"],
    tx.$["select.orderBy"],
  ]) {
    step.mockImplementation(answer);
  }

  return {
    db,
    /** The tables the snapshot's selects read, in order. */
    tables: () =>
      tx.$["select.from"].mock.calls.map(([table]) =>
        is(table, Table) ? getTableName(table) : null
      ),
    tx,
    /** The `where` of each select of `table`, as SQL and parameters. */
    wheres: (table: string) =>
      filters
        .filter((filter) => filter.table === table)
        .map((filter) => renderQuery(filter.where)),
  };
}

describe("getDashboard", () => {
  test("reads in one read-only, repeatable-read snapshot, every query through it", async () => {
    const { db, tables } = setup();

    await getDashboard(db as never, SCOPE);

    expect(db.$.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      { accessMode: "read only", isolationLevel: "repeatable read" }
    );
    expect(db.$.select).not.toHaveBeenCalled();
    expect(tables()).toEqual(SNAPSHOT_READS);
  });

  test("bounds the orders by the range's first and last midnights in Montevideo, the column bare", async () => {
    const { db, wheres } = setup();

    await getDashboard(db as never, SCOPE);

    expect(wheres("customer_order")).toEqual(
      [0, 1].map(() => ({
        params: [3, "2026-12-01", "2026-12-07"],
        sql:
          '("customer_order"."storeId" = $1 and ("customer_order"."createdAt" >= ' +
          "(($2::date)::timestamp at time zone 'America/Montevideo') and " +
          '"customer_order"."createdAt" < ' +
          "((($3::date)::timestamp at time zone 'America/Montevideo') + interval '1 day')))",
      }))
    );
  });

  test("an empty store has nothing to show and asks for no title or units", async () => {
    const { db, tables } = setup();

    await expect(getDashboard(db as never, SCOPE)).resolves.toEqual({
      articlesPerWeek: [],
      catalog: { draft: 0, published: 0, unavailable: 0 },
      funnel: { orders: 0, views: 0, visits: 0 },
      logins: [],
      orders: {
        byCurrency: [],
        byDay: [],
        byStatus: { delivered: 0, packed: 0, received: 0, undeliverable: 0 },
        undeliverableShare: null,
      },
      topOrdered: [],
      topViewed: [],
      traffic: [],
      viewedNotOrdered: [],
    });
    // Titles and units ask nothing of a store with nothing ranked.
    expect(tables()).toEqual(SNAPSHOT_READS);
  });

  test("merges, ranks, titles and totals what each query answers", async () => {
    const lastSignInAt = new Date("2026-12-05T12:00:00.000Z");
    const { db, tables } = setup({
      customer_order: [
        // By day and currency, then by status.
        [
          { amount: 4000, currencyCode: "UYU", day: "2026-12-01", orders: 2 },
          { amount: 1500, currencyCode: "USD", day: "2026-12-02", orders: 1 },
          { amount: 2000, currencyCode: "UYU", day: "2026-12-04", orders: 1 },
        ],
        [
          { orders: 3, status: "received" },
          { orders: 1, status: "undeliverable" },
        ],
      ],
      order_item: [
        // The "no order holds it" subquery, never run on its own.
        [],
        // The most ordered: a line whose article is gone is left out, and
        // an article with no title keeps the one its order copied.
        [
          { productId: 7, title: "Anillo copiado", units: 4 },
          { productId: 9, title: "Aro copiado", units: 2 },
          { productId: null, title: "Borrado", units: 9 },
        ],
        // The units of the most viewed.
        [
          { productId: 7, units: 4 },
          { productId: null, units: 1 },
        ],
      ],
      product: [
        [
          { articles: 5, isAvailable: true, status: "published" },
          { articles: 2, isAvailable: false, status: "published" },
          { articles: 1, isAvailable: true, status: "draft" },
          { articles: 2, isAvailable: false, status: "draft" },
        ],
        [{ created: 3, week: "2026-11-30" }],
      ],
      product_translation: [
        [
          { locale: "es", productId: 7, title: "Anillo" },
          { locale: "en", productId: 7, title: "Ring" },
          { locale: "es", productId: 8, title: "Cadena" },
          { locale: "es", productId: 9, title: "" },
        ],
      ],
      product_view_daily: [
        // Views per day, then the most viewed, then those with no order.
        [
          { day: "2026-12-01", views: 5 },
          { day: "2026-12-03", views: 2 },
        ],
        [
          { productId: 7, views: 8 },
          { productId: 8, views: 4 },
          { productId: 10, views: 1 },
        ],
        [{ productId: 8, views: 4 }],
      ],
      store_visit_daily: [
        [
          { day: "2026-12-01", visits: 10 },
          { day: "2026-12-02", visits: 3 },
        ],
      ],
      user: [
        [{ email: "ana@example.com", id: "u1", lastSignInAt, name: "Ana" }],
      ],
    });

    const dashboard = await getDashboard(db as never, SCOPE);

    // Then the ranked articles' titles and the most viewed's units.
    expect(tables()).toEqual([
      ...SNAPSHOT_READS,
      "product_translation",
      "order_item",
    ]);
    expect(dashboard).toEqual({
      articlesPerWeek: [{ created: 3, week: "2026-11-30" }],
      catalog: { draft: 3, published: 5, unavailable: 2 },
      funnel: { orders: 4, views: 7, visits: 13 },
      logins: [
        { email: "ana@example.com", id: "u1", lastSignInAt, name: "Ana" },
      ],
      orders: {
        byCurrency: [
          { amount: 6000, average: 2000, currencyCode: "UYU", orders: 3 },
          { amount: 1500, average: 1500, currencyCode: "USD", orders: 1 },
        ],
        byDay: [
          { amount: 4000, currencyCode: "UYU", day: "2026-12-01", orders: 2 },
          { amount: 1500, currencyCode: "USD", day: "2026-12-02", orders: 1 },
          { amount: 2000, currencyCode: "UYU", day: "2026-12-04", orders: 1 },
        ],
        byStatus: { delivered: 0, packed: 0, received: 3, undeliverable: 1 },
        undeliverableShare: 0.25,
      },
      topOrdered: [
        { productId: 7, title: "Ring", units: 4 },
        { productId: 9, title: "Aro copiado", units: 2 },
      ],
      topViewed: [
        { productId: 7, title: "Ring", units: 4, views: 8 },
        { productId: 8, title: "Cadena", units: 0, views: 4 },
        // An article with no text at all.
        { productId: 10, title: "", units: 0, views: 1 },
      ],
      // In the range's order, a day with visits and no views included.
      traffic: [
        { day: "2026-12-01", views: 5, visits: 10 },
        { day: "2026-12-02", views: 0, visits: 3 },
        { day: "2026-12-03", views: 2, visits: 0 },
      ],
      viewedNotOrdered: [{ productId: 8, title: "Cadena", views: 4 }],
    });
  });
});
