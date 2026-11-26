import { and, eq, lt, sql } from "drizzle-orm";

import {
  PRODUCT_VIEWS_PER_CLIENT_PER_DAY,
  STORE_VISITS_PER_CLIENT_PER_DAY,
} from "@/lib/schemas/metrics";
import type { DatabaseClient } from "@/server/db";
import {
  metricRateLimit,
  product,
  productViewDaily,
  store,
  storeVisitDaily,
} from "@/server/db/schema";

/** What became of one count: added, over its client's cap, or for nothing. */
export type CountOutcome = "capped" | "counted" | "not_found";

interface CountScope {
  /**
   * The client's bucket for this count (`metricsBucket`), or `null` when the
   * request had no address: the cap is then skipped.
   */
  bucket: string | null;
  /** The business day in Montevideo, `YYYY-MM-DD` (`businessDay`). */
  day: string;
}

/**
 * Deletes the buckets of the days before yesterday: only today's are
 * counted against, and yesterday's stay one more day for a count that took
 * its day before midnight and is written after it, which must still find
 * its bucket full rather than start a new one. An older one is a client's
 * trace kept for nothing. Its own statement, outside the count's
 * transaction, so the count's locks stay its own.
 */
async function dropOldBuckets(db: DatabaseClient, day: string) {
  await db
    .delete(metricRateLimit)
    .where(lt(metricRateLimit.day, sql`${day}::date - 1`));
}

/**
 * Takes one of the `cap` hits `bucket` has on `day`, in one upsert: the row
 * the conflict locks is incremented only while under the cap, so two
 * requests at once never both take the last one. `false` once spent.
 */
async function takeHit(
  tx: DatabaseClient,
  { bucket, cap, day }: { bucket: string; cap: number; day: string }
): Promise<boolean> {
  const taken = await tx
    .insert(metricRateLimit)
    .values({ bucket, day, hits: 1 })
    .onConflictDoUpdate({
      set: { hits: sql`${metricRateLimit.hits} + 1` },
      setWhere: lt(metricRateLimit.hits, cap),
      target: [metricRateLimit.day, metricRateLimit.bucket],
    })
    .returning({ hits: metricRateLimit.hits });

  return taken.length > 0;
}

/**
 * Counts one view of a published article on `day` (FER-029). The article is
 * held `FOR KEY SHARE` until the count commits, so a delete that commits
 * first leaves nothing to count, and one that comes later waits for it. A
 * draft, a deleted or an unknown article counts nothing and spends no hit,
 * so made-up ids leave no bucket behind.
 */
export async function countProductView(
  db: DatabaseClient,
  { bucket, day, productId }: CountScope & { productId: number }
): Promise<CountOutcome> {
  await dropOldBuckets(db, day);

  return await db.transaction(async (tx) => {
    const [article] = await tx
      .select({ id: product.id, storeId: product.storeId })
      .from(product)
      .where(and(eq(product.id, productId), eq(product.status, "published")))
      .for("key share");

    if (!article) {
      return "not_found";
    }

    if (
      bucket !== null &&
      !(await takeHit(tx, {
        bucket,
        cap: PRODUCT_VIEWS_PER_CLIENT_PER_DAY,
        day,
      }))
    ) {
      return "capped";
    }

    await tx
      .insert(productViewDaily)
      .values({
        day,
        productId: article.id,
        storeId: article.storeId,
        viewCount: 1,
      })
      .onConflictDoUpdate({
        set: { viewCount: sql`${productViewDaily.viewCount} + 1` },
        target: [productViewDaily.productId, productViewDaily.day],
      });

    return "counted";
  });
}

/** Counts one visit to the store on `day` (FER-029). */
export async function countStoreVisit(
  db: DatabaseClient,
  { bucket, day }: CountScope
): Promise<CountOutcome> {
  await dropOldBuckets(db, day);

  return await db.transaction(async (tx) => {
    // The site's one store (FER-038).
    const [found] = await tx.select({ id: store.id }).from(store);

    if (!found) {
      return "not_found";
    }

    if (
      bucket !== null &&
      !(await takeHit(tx, {
        bucket,
        cap: STORE_VISITS_PER_CLIENT_PER_DAY,
        day,
      }))
    ) {
      return "capped";
    }

    await tx
      .insert(storeVisitDaily)
      .values({ day, storeId: found.id, visitCount: 1 })
      .onConflictDoUpdate({
        set: { visitCount: sql`${storeVisitDaily.visitCount} + 1` },
        target: [storeVisitDaily.storeId, storeVisitDaily.day],
      });

    return "counted";
  });
}
