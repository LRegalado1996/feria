import { readFileSync } from "node:fs";

import { inArray, sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { RESERVED_CATEGORY_SLUGS } from "@/lib/schemas/catalog";
import { type DatabaseClient, db } from "@/server/db";
import { category } from "@/server/db/schema";
import { theStoreId, uniqueTag } from "@/server/test/one-store";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Migration 0015 (FER-043) renames every category whose slug is a path the
// site already answers: it rewrites rows, so it must converge when replayed
// (docs/agents/database.md § Migrations). The test writes the state the
// migration met inside a transaction it rolls back, so the worker's
// database is left as it was.

const MIGRATION = readFileSync(
  new URL("0015_overrated_ego.sql", import.meta.url),
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

/** Categories of the store with these slugs, as a build before 0015 wrote them. */
async function addCategories(
  tx: DatabaseClient,
  storeId: number,
  slugs: readonly string[]
) {
  return await tx
    .insert(category)
    .values(slugs.map((slug, position) => ({ position, slug, storeId })))
    .returning({ id: category.id });
}

/** Each category's slug, in the order of `ids`. */
async function slugsOf(tx: DatabaseClient, ids: number[]) {
  const rows = await tx
    .select({ id: category.id, slug: category.slug })
    .from(category)
    .where(inArray(category.id, ids));

  return ids.map((id) => rows.find((row) => row.id === id)?.slug);
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

describe("migration 0015: no category on a reserved path", () => {
  test("gives every reserved slug the first free one of its store, leaves the others, and converges when replayed", async () => {
    await rolledBack(async (tx, storeId) => {
      const own = `anillos-${uniqueTag()}`;
      const reserved = await addCategories(
        tx,
        storeId,
        RESERVED_CATEGORY_SLUGS
      );
      // `productos-2` is taken, so "Productos" becomes `productos-3`.
      const kept = await addCategories(tx, storeId, ["productos-2", own]);
      const ids = [...reserved, ...kept].map((row) => row.id);

      await applyMigration(tx);
      await applyMigration(tx);

      expect(await slugsOf(tx, ids)).toEqual([
        ...RESERVED_CATEGORY_SLUGS.map((slug) =>
          slug === "productos" ? "productos-3" : `${slug}-2`
        ),
        "productos-2",
        own,
      ]);
    });
  });
});
