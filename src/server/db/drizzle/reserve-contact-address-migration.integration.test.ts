import { readFileSync } from "node:fs";

import { inArray, sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { type DatabaseClient, db } from "@/server/db";
import { category, page } from "@/server/db/schema";
import { theStoreId, uniqueTag } from "@/server/test/one-store";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Migration 0030 (FER-080) renames a category or a page that holds
// `contacto`, the contact page's address from now on: it rewrites rows, so
// it must converge when replayed (docs/agents/database.md § Migrations).
// The test writes the state the migration met inside a transaction it
// rolls back, so the worker's database is left as it was.

const MIGRATION = readFileSync(
  new URL("0030_reserve_contact_address.sql", import.meta.url),
  "utf-8"
);

const ROLLED_BACK = "Rolled back on purpose: this test keeps nothing";

/** Every statement of the migration, in order, as the migrator runs them. */
async function applyMigration(tx: DatabaseClient) {
  for (const statement of MIGRATION.split("--> statement-breakpoint")) {
    if (statement.trim() !== "") {
      await tx.execute(sql.raw(statement));
    }
  }
}

/**
 * Runs `scenario` on the store in a transaction it then rolls back, failing
 * on its own error.
 */
async function rolledBack(
  scenario: (tx: DatabaseClient, storeId: number) => Promise<void>
) {
  const storeId = await theStoreId(db);
  const run = db.transaction(async (tx) => {
    await scenario(tx, storeId);

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation inside rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
}

/** A category of the store at `slug`, as a build before 0030 wrote it. */
async function addCategory(tx: DatabaseClient, storeId: number, slug: string) {
  const [row] = await tx
    .insert(category)
    .values({ position: 10_000, slug, storeId })
    .returning({ id: category.id });

  return row?.id ?? 0;
}

/** A page of the store at `slug`, as a build before 0030 wrote it. */
async function addPage(tx: DatabaseClient, storeId: number, slug: string) {
  const [row] = await tx
    .insert(page)
    .values({ slug, storeId })
    .returning({ id: page.id });

  return row?.id ?? 0;
}

async function categorySlugs(tx: DatabaseClient, ids: number[]) {
  const rows = await tx
    .select({ id: category.id, slug: category.slug })
    .from(category)
    .where(inArray(category.id, ids));

  return ids.map((id) => rows.find((row) => row.id === id)?.slug);
}

async function pageSlugs(tx: DatabaseClient, ids: number[]) {
  const rows = await tx
    .select({ id: page.id, slug: page.slug })
    .from(page)
    .where(inArray(page.id, ids));

  return ids.map((id) => rows.find((row) => row.id === id)?.slug);
}

/**
 * Whether another connection could take the store's category lock right
 * now: `false` while the transaction under test holds it. The probe's own
 * lock, when it gets one, ends with its statement.
 */
async function categoryLockIsFree(storeId: number) {
  const { rows } = await db.execute<{ free: boolean }>(
    sql`select pg_try_advisory_xact_lock(hashtext(${`category:${storeId}`})) as free`
  );

  return rows[0]?.free;
}

describe("migration 0030: no category or page at the contact page's address", () => {
  test("a category at contacto takes the first address free among categories and pages, the others stay, and a replay changes nothing", async () => {
    await rolledBack(async (tx, storeId) => {
      const own = `anillos-${uniqueTag()}`;
      const clash = await addCategory(tx, storeId, "contacto");
      const kept = await addCategory(tx, storeId, own);
      // A page already at `contacto-2`: the category skips it.
      const taken = await addPage(tx, storeId, "contacto-2");

      await applyMigration(tx);
      await applyMigration(tx);

      expect(await categorySlugs(tx, [clash, kept])).toEqual([
        "contacto-3",
        own,
      ]);
      expect(await pageSlugs(tx, [taken])).toEqual(["contacto-2"]);
    });
  });

  test("a page at contacto takes the first address free among pages and categories, and a replay changes nothing", async () => {
    await rolledBack(async (tx, storeId) => {
      const own = `regalos-${uniqueTag()}`;
      const clash = await addPage(tx, storeId, "contacto");
      const kept = await addPage(tx, storeId, own);
      // A category already at `contacto-2`: the page skips it.
      const taken = await addCategory(tx, storeId, "contacto-2");

      await applyMigration(tx);
      await applyMigration(tx);

      expect(await pageSlugs(tx, [clash, kept])).toEqual(["contacto-3", own]);
      expect(await categorySlugs(tx, [taken])).toEqual(["contacto-2"]);
    });
  });

  test("a store with neither is left as it was", async () => {
    await rolledBack(async (tx, storeId) => {
      const own = `aros-${uniqueTag()}`;
      const kept = await addCategory(tx, storeId, own);

      await applyMigration(tx);

      expect(await categorySlugs(tx, [kept])).toEqual([own]);
    });
  });

  test("holds the store's category lock from before it looks for rows to rename, so no category or page picks its address meanwhile", async () => {
    await rolledBack(async (tx, storeId) => {
      expect(await categoryLockIsFree(storeId)).toBe(true);

      // Even with no row at `contacto` yet: one could arrive before the
      // table lock.
      await applyMigration(tx);

      expect(await categoryLockIsFree(storeId)).toBe(false);
    });
  });
});
