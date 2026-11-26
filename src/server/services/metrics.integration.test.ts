import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  PRODUCT_VIEWS_PER_CLIENT_PER_DAY,
  STORE_VISITS_PER_CLIENT_PER_DAY,
} from "@/lib/schemas/metrics";
import { db } from "@/server/db";
import {
  category,
  metricRateLimit,
  product,
  productViewDaily,
  storeVisitDaily,
} from "@/server/db/schema";
import { theStoreId, uniqueTag } from "@/server/test/one-store";
import {
  backendPid,
  deferred,
  readyOrFailed,
  releaseHeldWriters,
  releaseOnTeardown,
  waitUntilBlockedBy,
} from "@/server/test/two-writers";

import { countProductView, countStoreVisit } from "./metrics";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Days no real count holds, so the buckets each count deletes (those of
// the days before it) are only this file's.
const DAY = "2031-03-14";
const NEXT_DAY = "2031-03-15";
// The store's one row of a day is shared: this day's is the visit test's.
const VISIT_DAY = "2031-04-01";

// The store is shared (`theStoreId`): what this file created is deleted by
// id after each test. Deleting an article takes its daily views; the
// buckets go by the buckets used here, the store's visits by their ids.
const created = {
  buckets: [] as string[],
  categoryIds: [] as number[],
  productIds: [] as number[],
  visitIds: [] as number[],
};

afterEach(async () => {
  await releaseHeldWriters();
  await db
    .delete(product)
    .where(inArray(product.id, created.productIds.splice(0)));
  await db
    .delete(category)
    .where(inArray(category.id, created.categoryIds.splice(0)));
  await db
    .delete(metricRateLimit)
    .where(inArray(metricRateLimit.bucket, created.buckets.splice(0)));
  await db
    .delete(storeVisitDaily)
    .where(inArray(storeVisitDaily.id, created.visitIds.splice(0)));
});

/** A bucket no other test holds, deleted after the test. */
function makeBucket() {
  const bucket = randomUUID();
  created.buckets.push(bucket);

  return bucket;
}

/** A published (or draft) article of the store, in a category of its own. */
async function makeArticle({ published = true } = {}) {
  const storeId = await theStoreId(db);
  const tag = uniqueTag();
  const [group] = await db
    .insert(category)
    .values({ position: 0, slug: `vistas-${tag}`, storeId })
    .returning({ id: category.id });

  if (!group) {
    throw new Error("The category was not created");
  }

  created.categoryIds.push(group.id);
  const [row] = await db
    .insert(product)
    .values({
      categoryId: group.id,
      priceAmount: 1000,
      slug: `anillo-${tag}`,
      storeId,
      ...(published
        ? { publishedAt: new Date(), status: "published" as const }
        : {}),
    })
    .returning({ id: product.id });

  if (!row) {
    throw new Error("The article was not created");
  }

  created.productIds.push(row.id);

  return { id: row.id, storeId };
}

/** The article's daily views, day by day. */
async function viewsOf(productId: number) {
  return await db
    .select({
      day: productViewDaily.day,
      storeId: productViewDaily.storeId,
      viewCount: productViewDaily.viewCount,
    })
    .from(productViewDaily)
    .where(eq(productViewDaily.productId, productId))
    .orderBy(productViewDaily.day);
}

/** The store's row of visits on `day`, or `null` while it has none. */
async function visitsOn(day: string) {
  const storeId = await theStoreId(db);
  const [row] = await db
    .select({ id: storeVisitDaily.id, visitCount: storeVisitDaily.visitCount })
    .from(storeVisitDaily)
    .where(
      and(eq(storeVisitDaily.storeId, storeId), eq(storeVisitDaily.day, day))
    );

  return row ?? null;
}

/** The hits `bucket` holds on `day`; `null` while it has no row. */
async function hitsOf(bucket: string, day: string) {
  const [row] = await db
    .select({ hits: metricRateLimit.hits })
    .from(metricRateLimit)
    .where(
      and(eq(metricRateLimit.bucket, bucket), eq(metricRateLimit.day, day))
    );

  return row?.hits ?? null;
}

/** Runs `count` `times` in a row, answering each outcome. */
async function repeat(times: number, count: () => Promise<string>) {
  const outcomes: string[] = [];

  for (let index = 0; index < times; index += 1) {
    outcomes.push(await count());
  }

  return outcomes;
}

describe("countProductView", () => {
  test("adds each view to the article's row of its day, one row per day", async () => {
    const article = await makeArticle();

    await repeat(
      3,
      async () =>
        await countProductView(db, {
          bucket: null,
          day: DAY,
          productId: article.id,
        })
    );
    await countProductView(db, {
      bucket: null,
      day: NEXT_DAY,
      productId: article.id,
    });

    expect(await viewsOf(article.id)).toEqual([
      { day: DAY, storeId: article.storeId, viewCount: 3 },
      { day: NEXT_DAY, storeId: article.storeId, viewCount: 1 },
    ]);
  });

  test("stops one client at the cap on one article, while another client and another article still count", async () => {
    const ring = await makeArticle();
    const chain = await makeArticle();
    const burst = makeBucket();
    const other = makeBucket();

    const outcomes = await repeat(
      PRODUCT_VIEWS_PER_CLIENT_PER_DAY + 5,
      async () =>
        await countProductView(db, {
          bucket: burst,
          day: DAY,
          productId: ring.id,
        })
    );
    await countProductView(db, { bucket: other, day: DAY, productId: ring.id });
    await countProductView(db, {
      bucket: makeBucket(),
      day: DAY,
      productId: chain.id,
    });

    expect(outcomes).toEqual([
      ...Array.from(
        { length: PRODUCT_VIEWS_PER_CLIENT_PER_DAY },
        () => "counted"
      ),
      ...Array.from({ length: 5 }, () => "capped"),
    ]);
    expect(await hitsOf(burst, DAY)).toBe(PRODUCT_VIEWS_PER_CLIENT_PER_DAY);
    expect(await viewsOf(ring.id)).toEqual([
      {
        day: DAY,
        storeId: ring.storeId,
        viewCount: PRODUCT_VIEWS_PER_CLIENT_PER_DAY + 1,
      },
    ]);
    expect(await viewsOf(chain.id)).toEqual([
      { day: DAY, storeId: chain.storeId, viewCount: 1 },
    ]);
  });

  test("counts a draft or an unknown article for nothing, leaving no bucket behind", async () => {
    const draft = await makeArticle({ published: false });
    const bucket = makeBucket();

    await expect(
      countProductView(db, { bucket, day: DAY, productId: draft.id })
    ).resolves.toBe("not_found");
    await expect(
      countProductView(db, { bucket, day: DAY, productId: 2_147_483_647 })
    ).resolves.toBe("not_found");

    expect(await viewsOf(draft.id)).toEqual([]);
    expect(await hitsOf(bucket, DAY)).toBeNull();
  });

  test("a count on a new day deletes the buckets of the days before it", async () => {
    const article = await makeArticle();
    const yesterday = makeBucket();
    await countProductView(db, {
      bucket: yesterday,
      day: DAY,
      productId: article.id,
    });

    expect(await hitsOf(yesterday, DAY)).toBe(1);

    const today = makeBucket();
    await countProductView(db, {
      bucket: today,
      day: NEXT_DAY,
      productId: article.id,
    });

    expect(await hitsOf(yesterday, DAY)).toBeNull();
    expect(await hitsOf(today, NEXT_DAY)).toBe(1);
  });
});

describe("countStoreVisit", () => {
  test("adds each visit to the store's day, and stops one client at its cap", async () => {
    // The day's row is this test's to make: none may be there before.
    expect(await visitsOn(VISIT_DAY)).toBeNull();
    // One hit short of the cap, as a hundred visits before would leave it.
    const burst = makeBucket();
    await db.insert(metricRateLimit).values({
      bucket: burst,
      day: VISIT_DAY,
      hits: STORE_VISITS_PER_CLIENT_PER_DAY - 1,
    });

    const outcomes = await repeat(
      2,
      async () => await countStoreVisit(db, { bucket: burst, day: VISIT_DAY })
    );
    await countStoreVisit(db, { bucket: makeBucket(), day: VISIT_DAY });
    await countStoreVisit(db, { bucket: null, day: VISIT_DAY });
    const visits = await visitsOn(VISIT_DAY);
    created.visitIds.push(...(visits ? [visits.id] : []));

    expect(outcomes).toEqual(["counted", "capped"]);
    expect(await hitsOf(burst, VISIT_DAY)).toBe(
      STORE_VISITS_PER_CLIENT_PER_DAY
    );
    expect(visits?.visitCount).toBe(3);
  });
});

describe("two views of one client at once, with one hit left", () => {
  /**
   * Two counts of one client's bucket, holding `hits` of the cap already:
   * the first commits only once the second is waiting on its row.
   */
  async function race(hits: number) {
    const article = await makeArticle();
    const bucket = makeBucket();
    await db.insert(metricRateLimit).values({ bucket, day: DAY, hits });
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
    const scope = { bucket, day: DAY, productId: article.id };

    const first = db.transaction(async (tx) => {
      firstPid.resolve(await backendPid(tx));
      const outcome = await countProductView(tx, scope);
      written.resolve(undefined);
      await held.promise;

      return outcome;
    });
    writers.push(first);
    await readyOrFailed(written.promise, first);
    const second = db.transaction(async (tx) => {
      secondPid.resolve(await backendPid(tx));

      return await countProductView(tx, scope);
    });
    writers.push(second);

    try {
      await waitUntilBlockedBy(
        db,
        await readyOrFailed(secondPid.promise, second),
        await readyOrFailed(firstPid.promise, first)
      );
    } finally {
      held.resolve(undefined);
      await Promise.allSettled([first, second]);
    }

    return {
      bucket,
      outcomes: [await first, await second],
      views: await viewsOf(article.id),
    };
  }

  test("the second waits for the first's hit and finds the bucket spent", async () => {
    const { bucket, outcomes, views } = await race(
      PRODUCT_VIEWS_PER_CLIENT_PER_DAY - 1
    );

    expect(outcomes).toEqual(["counted", "capped"]);
    expect(views.map((row) => row.viewCount)).toEqual([1]);
    expect(await hitsOf(bucket, DAY)).toBe(PRODUCT_VIEWS_PER_CLIENT_PER_DAY);
  });

  test("control: with two hits left, both count", async () => {
    const { bucket, outcomes, views } = await race(
      PRODUCT_VIEWS_PER_CLIENT_PER_DAY - 2
    );

    expect(outcomes).toEqual(["counted", "counted"]);
    expect(views.map((row) => row.viewCount)).toEqual([2]);
    expect(await hitsOf(bucket, DAY)).toBe(PRODUCT_VIEWS_PER_CLIENT_PER_DAY);
  });
});
