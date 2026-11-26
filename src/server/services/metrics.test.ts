import { getTableName, is, Table } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import {
  PRODUCT_VIEWS_PER_CLIENT_PER_DAY,
  STORE_VISITS_PER_CLIENT_PER_DAY,
} from "@/lib/schemas/metrics";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { countProductView, countStoreVisit } from "./metrics";

const DAY = "2026-12-05";
const BUCKET = "the-client-bucket";

interface Conflict {
  set: Record<string, unknown>;
  setWhere?: unknown;
  target: { name: string }[];
}

/**
 * The mock database answering the count's reads: the article the lookup
 * finds (`null`: none published by that id), the store's row (`null`: none)
 * and whether the client's bucket still had a hit.
 */
function isConflict(value: unknown): value is Conflict {
  return typeof value === "object" && value !== null && "target" in value;
}

function setup({
  article = { id: 58, storeId: 3 },
  hit = true,
  storeId = 3,
}: {
  article?: { id: number; storeId: number } | null;
  hit?: boolean;
  storeId?: number | null;
} = {}) {
  const db = createMockDatabase();
  // The count's transaction: a handle of its own, so a read or a write
  // that went through the outer client instead would show.
  const tx = createMockDatabase();
  db.$.transaction.mockImplementation(async (callback: unknown) =>
    typeof callback === "function" ? await callback(tx) : undefined
  );
  tx.$["select.for"].mockResolvedValue(article ? [article] : []);
  // The visit's read ends at `from`; the view's goes on to `.for()`.
  tx.$["select.from"].mockResolvedValue(
    storeId === null ? [] : [{ id: storeId }]
  );
  tx.$["insert.returning"].mockResolvedValue(hit ? [{ hits: 1 }] : []);

  return {
    db,
    tx,
    /** Each upsert's conflict clause, its SQL rendered. */
    conflicts: () =>
      tx.$["insert.onConflictDoUpdate"].mock.calls.map(([arg]) => {
        if (!isConflict(arg)) {
          throw new Error("An upsert without its conflict clause");
        }

        const { set, setWhere, target } = arg;

        return {
          set: Object.fromEntries(
            Object.entries(set).map(([column, value]) => [
              column,
              renderQuery(value).sql,
            ])
          ),
          setWhere: setWhere === undefined ? null : renderQuery(setWhere),
          target: target.map((column) => column.name),
        };
      }),
    /** The tables written, in order. */
    inserts: () =>
      tx.$.insert.mock.calls.map(([table]) =>
        is(table, Table) ? getTableName(table) : null
      ),
    values: () => tx.$["insert.values"].mock.calls.map(([values]) => values),
    /** What the old buckets' delete was given. */
    deleted: () =>
      db.$["delete.where"].mock.calls.map(([where]) => renderQuery(where)),
  };
}

const DROP_OLD = { params: [DAY], sql: '"metric_rate_limit"."day" < $1' };

function takeHitConflict(cap: number) {
  return {
    set: { hits: '"metric_rate_limit"."hits" + 1' },
    setWhere: { params: [cap], sql: '"metric_rate_limit"."hits" < $1' },
    target: ["day", "bucket"],
  };
}

describe("countProductView", () => {
  test("takes a hit from the client's bucket under the article cap, then adds one view to the article's day", async () => {
    const { conflicts, db, deleted, inserts, values } = setup();

    await expect(
      countProductView(db as never, { bucket: BUCKET, day: DAY, productId: 58 })
    ).resolves.toBe("counted");

    expect(inserts()).toEqual(["metric_rate_limit", "product_view_daily"]);
    expect(values()).toEqual([
      { bucket: BUCKET, day: DAY, hits: 1 },
      { day: DAY, productId: 58, storeId: 3, viewCount: 1 },
    ]);
    expect(conflicts()).toEqual([
      takeHitConflict(PRODUCT_VIEWS_PER_CLIENT_PER_DAY),
      {
        set: { viewCount: '"product_view_daily"."viewCount" + 1' },
        setWhere: null,
        target: ["productId", "day"],
      },
    ]);
    expect(deleted()).toEqual([DROP_OLD]);
  });

  test("looks the article up among the published, held FOR KEY SHARE, inside the count's transaction", async () => {
    const { db, tx } = setup();

    await countProductView(db as never, {
      bucket: BUCKET,
      day: DAY,
      productId: 58,
    });

    expect(
      tx.$["select.where"].mock.calls.map(([where]) => renderQuery(where))
    ).toEqual([
      {
        params: [58, "published"],
        sql: '("product"."id" = $1 and "product"."status" = $2)',
      },
    ]);
    expect(tx.$["select.for"]).toHaveBeenCalledExactlyOnceWith("key share");
    // Nothing but the old buckets' delete goes through the outer client.
    expect(db.$.select).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(tx.$.delete).not.toHaveBeenCalled();
    // The old buckets go first, in a statement of their own.
    expect(db.$.delete.mock.invocationCallOrder[0]).toBeLessThan(
      db.$.transaction.mock.invocationCallOrder[0] ?? 0
    );
  });

  test("counts nothing and spends no hit for an article that is not published", async () => {
    const { db, inserts } = setup({ article: null });

    await expect(
      countProductView(db as never, { bucket: BUCKET, day: DAY, productId: 58 })
    ).resolves.toBe("not_found");
    expect(inserts()).toEqual([]);
  });

  test("counts nothing once the client's bucket is spent", async () => {
    const { db, inserts } = setup({ hit: false });

    await expect(
      countProductView(db as never, { bucket: BUCKET, day: DAY, productId: 58 })
    ).resolves.toBe("capped");
    expect(inserts()).toEqual(["metric_rate_limit"]);
  });

  test("without a bucket counts the view with no cap", async () => {
    const { db, inserts } = setup();

    await expect(
      countProductView(db as never, { bucket: null, day: DAY, productId: 58 })
    ).resolves.toBe("counted");
    expect(inserts()).toEqual(["product_view_daily"]);
  });
});

describe("countStoreVisit", () => {
  test("takes a hit under the visit cap, then adds one visit to the store's day", async () => {
    const { conflicts, db, deleted, inserts, values } = setup({ storeId: 9 });

    await expect(
      countStoreVisit(db as never, { bucket: BUCKET, day: DAY })
    ).resolves.toBe("counted");

    expect(inserts()).toEqual(["metric_rate_limit", "store_visit_daily"]);
    expect(values()).toEqual([
      { bucket: BUCKET, day: DAY, hits: 1 },
      { day: DAY, storeId: 9, visitCount: 1 },
    ]);
    expect(conflicts()).toEqual([
      takeHitConflict(STORE_VISITS_PER_CLIENT_PER_DAY),
      {
        set: { visitCount: '"store_visit_daily"."visitCount" + 1' },
        setWhere: null,
        target: ["storeId", "day"],
      },
    ]);
    expect(deleted()).toEqual([DROP_OLD]);
  });

  test("counts nothing once the client's bucket is spent", async () => {
    const { db, inserts } = setup({ hit: false });

    await expect(
      countStoreVisit(db as never, { bucket: BUCKET, day: DAY })
    ).resolves.toBe("capped");
    expect(inserts()).toEqual(["metric_rate_limit"]);
  });

  test("without a bucket counts the visit with no cap", async () => {
    const { db, inserts } = setup();

    await expect(
      countStoreVisit(db as never, { bucket: null, day: DAY })
    ).resolves.toBe("counted");
    expect(inserts()).toEqual(["store_visit_daily"]);
  });

  test("counts nothing on a database without the store's row", async () => {
    const { db, inserts } = setup({ storeId: null });

    await expect(
      countStoreVisit(db as never, { bucket: BUCKET, day: DAY })
    ).resolves.toBe("not_found");
    expect(inserts()).toEqual([]);
  });
});
