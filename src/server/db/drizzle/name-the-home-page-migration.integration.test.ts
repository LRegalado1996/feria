import { readFileSync } from "node:fs";

import { asc, eq, sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { type DatabaseClient, db } from "@/server/db";
import { category, page, pageTranslation, store } from "@/server/db/schema";
import { uniqueTag } from "@/server/test/one-store";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Migration 0025 (FER-060) gives the home page 0021 made an address, a
// published status and its name, "Home" in both languages: it writes rows,
// so it must converge when replayed (docs/agents/database.md § Migrations).
// Each scenario runs on tables of its own: empty copies of the four the
// migration touches, in a schema made inside a transaction it rolls back,
// first on the search path. It never reads or changes the worker's store,
// pages or categories, and leaves nothing behind.

const MIGRATION = readFileSync(
  new URL("0025_name_the_home_page.sql", import.meta.url),
  "utf-8"
);

const ROLLED_BACK = "Rolled back on purpose: this test keeps nothing";

/** The tables 0025 reads and writes. */
const TABLES = ["store", "page", "page_translation", "category"] as const;

/** Every statement of the migration, in order, as the migrator runs them. */
async function applyMigration(tx: DatabaseClient) {
  for (const statement of MIGRATION.split("--> statement-breakpoint")) {
    if (statement.trim() !== "") {
      await tx.execute(sql.raw(statement));
    }
  }
}

/**
 * Runs `scenario` on a store of its own as 0024 left it: its home page
 * with no address, no words and unpublished, no other page and no
 * category, in a transaction it then rolls back.
 */
async function rolledBack(
  scenario: (
    tx: DatabaseClient,
    own: { homeId: number; storeId: number }
  ) => Promise<void>
) {
  const run = db.transaction(async (tx) => {
    const schema = sql.identifier(`migration_0025_${uniqueTag()}`);
    await tx.execute(sql`create schema ${schema}`);

    for (const table of TABLES) {
      const name = sql.identifier(table);
      await tx.execute(
        sql`create table ${schema}.${name} (like public.${name} including all)`
      );
    }

    // Unqualified names, the migration's and Drizzle's, now meet the copies.
    await tx.execute(sql`set local search_path to ${schema}, public`);
    await tx.execute(sql`alter table "page" alter column "slug" drop not null`);
    const [made] = await tx
      .insert(store)
      .values({ currencyCode: "UYU", homePageId: 0, name: "Migration 0025" })
      .returning({ id: store.id });
    const storeId = made?.id ?? 0;
    const [home] = await tx
      .insert(page)
      .values({ isPublished: false, slug: "pending", storeId })
      .returning({ id: page.id });
    const homeId = home?.id ?? 0;
    await tx.execute(
      sql`update "page" set "slug" = null where "id" = ${homeId}`
    );
    await tx
      .update(store)
      .set({ homePageId: homeId })
      .where(eq(store.id, storeId));
    await scenario(tx, { homeId, storeId });

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation inside rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
}

/** The home page as the migration leaves it. */
async function readHome(tx: DatabaseClient, homeId: number) {
  return await tx.query.page.findFirst({
    columns: { isPublished: true, slug: true },
    where: eq(page.id, homeId),
    with: {
      translations: {
        columns: { locale: true, name: true },
        orderBy: asc(pageTranslation.locale),
      },
    },
  });
}

describe("migration 0025: the home is a page like any other", () => {
  test("gives the home the address /home, publishes it and names it Home in both languages, and converges when replayed", async () => {
    await rolledBack(async (tx, { homeId }) => {
      await applyMigration(tx);
      const first = await readHome(tx, homeId);
      await applyMigration(tx);

      expect(first).toEqual({
        isPublished: true,
        slug: "home",
        translations: [
          { locale: "es", name: "Home" },
          { locale: "en", name: "Home" },
        ],
      });
      expect(await readHome(tx, homeId)).toEqual(first);
    });
  });

  test("with a category at /home already, takes /home-<id> instead", async () => {
    await rolledBack(async (tx, { homeId, storeId }) => {
      await tx.insert(category).values({
        position: 10_000,
        slug: "home",
        storeId,
      });

      await applyMigration(tx);

      expect(await readHome(tx, homeId)).toMatchObject({
        slug: `home-${String(homeId)}`,
      });
    });
  });

  test("with categories at both /home and /home-<id>, takes /home-<id>-2", async () => {
    await rolledBack(async (tx, { homeId, storeId }) => {
      const taken = `home-${String(homeId)}`;
      await tx.insert(category).values({
        position: 10_000,
        slug: "home",
        storeId,
      });
      await tx.insert(category).values({
        position: 10_001,
        slug: taken,
        storeId,
      });

      await applyMigration(tx);

      expect(await readHome(tx, homeId)).toMatchObject({
        slug: `${taken}-2`,
      });
    });
  });

  test("leaves a page that already has an address and words alone", async () => {
    await rolledBack(async (tx, { homeId }) => {
      const name = `Inicio ${uniqueTag()}`;
      await tx.update(page).set({ slug: "portada" }).where(eq(page.id, homeId));
      await tx
        .insert(pageTranslation)
        .values({ locale: "es", name, pageId: homeId });

      await applyMigration(tx);

      expect(await readHome(tx, homeId)).toEqual({
        isPublished: true,
        slug: "portada",
        translations: [{ locale: "es", name }],
      });
    });
  });
});
