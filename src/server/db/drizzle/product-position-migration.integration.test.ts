import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { type DatabaseClient, db } from "@/server/db";
import { uniqueTag } from "@/server/test/one-store";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Migration 0016 (FER-044) gives every article a place in the store's own
// order and numbers the ones already there: a backfill, so it must converge
// when replayed (docs/agents/database.md § Migrations). Each test recreates
// the state the migration met inside a transaction it rolls back: Postgres
// undoes the column, the sequence and the rows, so the worker's database is
// left as it was.

const MIGRATION = readFileSync(
  new URL("0016_cynical_orphan.sql", import.meta.url),
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

/** The state before 0016: no place, no sequence, no index. */
async function dropPositions(tx: DatabaseClient) {
  await tx.execute(sql`alter table "product" drop column "position"`);
  await tx.execute(sql`drop sequence "product_position_seq"`);
}

async function theStoreId(tx: DatabaseClient) {
  const result = await tx.execute<{ id: number }>(
    sql`select "id" from "store" limit 1`
  );
  const id = result.rows[0]?.id;

  if (id === undefined) {
    throw new Error("The migrations create the store; this database has none");
  }

  return id;
}

/**
 * A draft article as a build without the column writes it, created at
 * `createdAt`: it names no place.
 */
async function insertArticle(
  tx: DatabaseClient,
  { createdAt, storeId }: { createdAt: string; storeId: number }
) {
  const result = await tx.execute<{ id: number }>(sql`
    insert into "product" ("storeId", "slug", "createdAt", "updatedAt")
    values (${storeId}, ${`migrated-${uniqueTag()}`}, ${createdAt}::timestamptz, now())
    returning "id"
  `);
  const id = result.rows[0]?.id;

  if (id === undefined) {
    throw new Error("Inserting an article returned no row");
  }

  return id;
}

/** The place of each of `ids`, in the order given. */
async function positionsOf(tx: DatabaseClient, ids: number[]) {
  const result = await tx.execute<{ id: number; position: number | null }>(
    sql`select "id", "position" from "product" where "id" in ${ids}`
  );
  const byId = new Map(result.rows.map((row) => [row.id, row.position]));

  return ids.map((id) => byId.get(id));
}

async function highestPosition(tx: DatabaseClient) {
  const result = await tx.execute<{ highest: number }>(
    sql`select max("position") as "highest" from "product"`
  );

  return result.rows[0]?.highest;
}

/** Runs `scenario` in a transaction it then rolls back, failing on its own error. */
async function rolledBack(scenario: (tx: DatabaseClient) => Promise<void>) {
  const run = db.transaction(async (tx) => {
    await scenario(tx);

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation inside rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
}

describe("migration 0016: the articles' own order", () => {
  test("numbers the articles in the order they were created, puts a new one last, and converges when replayed", async () => {
    await rolledBack(async (tx) => {
      await dropPositions(tx);
      const storeId = await theStoreId(tx);
      // Inserted in this order, created in another: the second is oldest.
      const middle = await insertArticle(tx, {
        createdAt: "2000-01-02T12:00:00Z",
        storeId,
      });
      const oldest = await insertArticle(tx, {
        createdAt: "2000-01-01T12:00:00Z",
        storeId,
      });
      const newest = await insertArticle(tx, {
        createdAt: "2000-01-03T12:00:00Z",
        storeId,
      });

      await applyMigration(tx);
      const [first, second, third] = await positionsOf(tx, [
        oldest,
        middle,
        newest,
      ]);
      // A build that names no place, as the one this deploy replaces.
      const added = await insertArticle(tx, {
        createdAt: "1999-12-01T12:00:00Z",
        storeId,
      });
      await applyMigration(tx);

      expect([first, second, third].map(Number)).toEqual([
        Number(first),
        Number(first) + 1,
        Number(first) + 2,
      ]);
      expect(await positionsOf(tx, [oldest, middle, newest])).toEqual([
        first,
        second,
        third,
      ]);
      // Last, whatever its date: the sequence starts after every article.
      const [addedPosition] = await positionsOf(tx, [added]);
      expect(addedPosition).toBe(await highestPosition(tx));
      expect(Number(addedPosition)).toBeGreaterThan(Number(third));
    });
  });

  test("keeps a place already set and numbers the unset ones after it", async () => {
    await rolledBack(async (tx) => {
      await dropPositions(tx);
      const storeId = await theStoreId(tx);
      const placed = await insertArticle(tx, {
        createdAt: "2000-01-05T12:00:00Z",
        storeId,
      });
      const unset = await insertArticle(tx, {
        createdAt: "2000-01-01T12:00:00Z",
        storeId,
      });
      // A half-applied run: the column there, one article placed far down.
      await tx.execute(
        sql`alter table "product" add column "position" integer`
      );
      await tx.execute(
        sql`update "product" set "position" = 5000 where "id" = ${placed}`
      );

      await applyMigration(tx);
      await applyMigration(tx);

      expect(await positionsOf(tx, [placed, unset])).toEqual([5000, 5001]);
    });
  });

  test("control: before the migration an article has no place", async () => {
    await rolledBack(async (tx) => {
      await dropPositions(tx);
      const storeId = await theStoreId(tx);
      await insertArticle(tx, { createdAt: "2000-01-01T12:00:00Z", storeId });

      const columns = await tx.execute<{ name: string }>(sql`
        select "column_name" as "name" from "information_schema"."columns"
        where "table_name" = 'product' and "column_name" = 'position'
      `);

      expect(columns.rows).toEqual([]);
    });
  });
});
