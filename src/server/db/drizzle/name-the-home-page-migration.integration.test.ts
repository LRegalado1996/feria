import { readFileSync } from "node:fs";

import { and, asc, eq, ne, sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { type DatabaseClient, db } from "@/server/db";
import { category, page, pageTranslation, store } from "@/server/db/schema";
import { theStoreId, uniqueTag } from "@/server/test/one-store";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Migration 0025 (FER-060) gives the home page 0021 made an address, a
// published status and its name, "Home" in both languages: it writes rows,
// so it must converge when replayed (docs/agents/database.md § Migrations).
// The test writes the state the migration met inside a transaction it rolls
// back, so the worker's database is left as it was.

const MIGRATION = readFileSync(
  new URL("0025_name_the_home_page.sql", import.meta.url),
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
 * Runs `scenario` on the store as 0024 left it: its home page with no
 * address, no words and unpublished, no other page, in a transaction it
 * then rolls back.
 */
async function rolledBack(
  scenario: (tx: DatabaseClient, homeId: number) => Promise<void>
) {
  const run = db.transaction(async (tx) => {
    const storeId = await theStoreId(tx);
    const [own] = await tx
      .select({ homePageId: store.homePageId })
      .from(store)
      .where(eq(store.id, storeId));
    const homeId = own?.homePageId ?? 0;
    await tx.execute(sql`alter table "page" alter column "slug" drop not null`);
    await tx
      .delete(page)
      .where(and(eq(page.storeId, storeId), ne(page.id, homeId)));
    await tx.execute(
      sql`update "page" set "slug" = null, "isPublished" = false where "id" = ${homeId}`
    );
    await tx.delete(pageTranslation).where(eq(pageTranslation.pageId, homeId));
    await tx
      .delete(category)
      .where(and(eq(category.storeId, storeId), eq(category.slug, "home")));
    await scenario(tx, homeId);

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
    await rolledBack(async (tx, homeId) => {
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
    await rolledBack(async (tx, homeId) => {
      const storeId = await theStoreId(tx);
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
    await rolledBack(async (tx, homeId) => {
      const storeId = await theStoreId(tx);
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
    await rolledBack(async (tx, homeId) => {
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
