import { readFileSync } from "node:fs";

import { eq, sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { type DatabaseClient, db } from "@/server/db";
import { category, store } from "@/server/db/schema";
import { uniqueTag } from "@/server/test/one-store";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Migration 0012 (FER-038) deletes every store but one before it allows only
// one, and gives a database with none LR Market's row: destructive, so it
// must converge when replayed (docs/agents/database.md § Migrations). Each
// test recreates the state the migration met, inside a transaction it rolls
// back: Postgres undoes the index it drops and the rows it deletes, so the
// worker's database is left as it was.

const MIGRATION = readFileSync(
  new URL("0012_outstanding_madame_masque.sql", import.meta.url),
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
 * The state before 0012: the one-row rule not there yet, and a store as the
 * multi-store model wrote it (an address, active, maybe the default).
 */
async function insertOldStore(
  tx: DatabaseClient,
  { isDefault = false, name }: { isDefault?: boolean; name: string }
) {
  const result = await tx.execute<{ id: number }>(sql`
    insert into "store" ("name", "currencyCode", "updatedAt", "slug", "isActive", "isDefault")
    values (${name}, 'USD', now(), ${`old-${uniqueTag()}`}, true, ${isDefault})
    returning "id"
  `);
  const id = result.rows[0]?.id;

  if (id === undefined) {
    throw new Error("Inserting an old store returned no row");
  }

  return id;
}

/**
 * No store holds the default mark, a column the Drizzle schema no longer
 * declares (it is read by nothing since FER-038), so it is written in SQL.
 */
async function unmarkEveryStore(tx: DatabaseClient) {
  await tx.execute(sql`update "store" set "isDefault" = false`);
}

/** A category of the store, to see what deleting the store takes with it. */
async function addCategory(tx: DatabaseClient, storeId: number) {
  await tx
    .insert(category)
    .values({ position: 0, slug: `old-${uniqueTag()}`, storeId });
}

async function storeIds(tx: DatabaseClient) {
  return (await tx.select({ id: store.id }).from(store).orderBy(store.id)).map(
    (row) => row.id
  );
}

async function categoriesOf(tx: DatabaseClient, storeId: number) {
  return await tx
    .select({ id: category.id })
    .from(category)
    .where(eq(category.storeId, storeId));
}

/** Whether a second store is refused now; tried under a savepoint. */
async function refusesASecondStore(tx: DatabaseClient) {
  try {
    await tx.transaction(async (savepoint) => {
      // In SQL: a store row of today must name its home page (FER-058),
      // which a store of before 0012 had none of.
      await savepoint.execute(
        sql`insert into "store" ("name", "currencyCode", "updatedAt") values ('Another', 'UYU', now())`
      );
    });

    return false;
  } catch (error) {
    return (
      (error as { cause?: { constraint?: string } }).cause?.constraint ===
      "store_single_row"
    );
  }
}

/** Runs `scenario` in a transaction it then rolls back, failing on its own error. */
async function rolledBack(scenario: (tx: DatabaseClient) => Promise<void>) {
  const run = db.transaction(async (tx) => {
    // The state before 0012: more than one store was allowed, and none had
    // a home page yet (0022, FER-058), which a store it inserts lacks.
    await tx.execute(sql`drop index if exists "store_single_row"`);
    await tx.execute(
      sql`alter table "store" alter column "homePageId" drop not null`
    );
    await scenario(tx);

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation inside rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
}

describe("migration 0012: one store", () => {
  test("keeps the oldest store when none is the default, deletes the others with their rows, and converges when replayed", async () => {
    await rolledBack(async (tx) => {
      await unmarkEveryStore(tx);
      const [oldest] = await storeIds(tx);
      const extra = await insertOldStore(tx, { name: "Tienda Demo" });
      await insertOldStore(tx, { name: "Otra" });
      await addCategory(tx, extra);

      await applyMigration(tx);
      await applyMigration(tx);

      expect(await storeIds(tx)).toEqual([oldest]);
      expect(await categoriesOf(tx, extra)).toEqual([]);
      expect(await refusesASecondStore(tx)).toBe(true);
    });
  });

  test("keeps the default store over an older one", async () => {
    await rolledBack(async (tx) => {
      await unmarkEveryStore(tx);
      const [oldest] = await storeIds(tx);
      const marked = await insertOldStore(tx, {
        isDefault: true,
        name: "The default",
      });
      await insertOldStore(tx, { name: "Otra" });

      await applyMigration(tx);
      await applyMigration(tx);

      expect(await storeIds(tx)).toEqual([marked]);
      expect(oldest).not.toBe(marked);
      expect(await refusesASecondStore(tx)).toBe(true);
    });
  });

  test("gives a database with no store LR Market's row, in pesos, once", async () => {
    await rolledBack(async (tx) => {
      // Every store goes, and with it everything that points to one.
      await tx.delete(store);

      await applyMigration(tx);
      await applyMigration(tx);

      expect(
        await tx
          .select({ currencyCode: store.currencyCode, name: store.name })
          .from(store)
      ).toEqual([{ currencyCode: "UYU", name: "LR Market" }]);
      expect(await refusesASecondStore(tx)).toBe(true);
    });
  });

  test("control: before the migration a second store is let in", async () => {
    await rolledBack(async (tx) => {
      expect(await refusesASecondStore(tx)).toBe(false);
    });
  });
});
