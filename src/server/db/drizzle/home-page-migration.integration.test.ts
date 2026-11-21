import { readFileSync } from "node:fs";

import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { type DatabaseClient, db } from "@/server/db";
import {
  banner,
  category,
  homeSection,
  page,
  pageCoverBanner,
  pageSection,
  store,
} from "@/server/db/schema";
import { theStoreId, uniqueTag } from "@/server/test/one-store";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Migration 0021 (FER-058) gives a store with no home its first page, points
// the store at it and copies FER-020's home-only placing into it: it writes
// rows, so it must converge when replayed (docs/agents/database.md §
// Migrations). The test writes the state the migration met inside a
// transaction it rolls back, so the worker's database is left as it was.

const MIGRATION = readFileSync(
  new URL("0021_home_page_backfill.sql", import.meta.url),
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
 * Runs `scenario` on the store as it was before 0020 (no home page named,
 * none of its banners or home places), in a transaction it then rolls back.
 */
async function rolledBack(
  scenario: (tx: DatabaseClient, storeId: number) => Promise<void>
) {
  const run = db.transaction(async (tx) => {
    const storeId = await theStoreId(tx);
    await tx.execute(
      sql`alter table "store" alter column "homePageId" drop not null`
    );
    // Before 0026 a page had no address (FER-060): the pages 0021 adds
    // get theirs from 0025.
    await tx.execute(sql`alter table "page" alter column "slug" drop not null`);
    await tx.execute(
      sql`update "store" set "homePageId" = null where "id" = ${storeId}`
    );
    await tx.delete(banner).where(eq(banner.storeId, storeId));
    await tx.delete(homeSection).where(eq(homeSection.storeId, storeId));
    await scenario(tx, storeId);

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation inside rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
}

/** A banner as FER-020's build wrote it: placed on the home by its columns. */
async function addOldBanner(
  tx: DatabaseClient,
  storeId: number,
  placing: { coverPosition: number } | "rows"
) {
  const [row] = await tx
    .insert(banner)
    .values({
      coverPosition: placing === "rows" ? null : placing.coverPosition,
      imageHeight: 800,
      imageUrl: "/seed/ring-3.jpg",
      imageWidth: 1200,
      placement: placing === "rows" ? "rows" : "cover",
      storeId,
    })
    .returning({ id: banner.id });

  return row?.id ?? 0;
}

/** The page the store points at as its home now. */
async function homeOf(tx: DatabaseClient, storeId: number) {
  const [row] = await tx
    .select({ homePageId: store.homePageId })
    .from(store)
    .where(eq(store.id, storeId));

  return row?.homePageId ?? null;
}

/** A category of the store at `position` in the categories' own order. */
async function addCategory(
  tx: DatabaseClient,
  storeId: number,
  position: number
) {
  const [row] = await tx
    .insert(category)
    .values({ position, slug: `home-${uniqueTag()}`, storeId })
    .returning({ id: category.id });

  return row?.id ?? 0;
}

/**
 * The store's categories other than `placed`, in their own order, as
 * sections of the short form `placesOf` answers from `position` on.
 */
async function unplacedCategories(
  tx: DatabaseClient,
  storeId: number,
  { placed, position }: { placed: number[]; position: number }
) {
  const rows = await tx
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.storeId, storeId), notInArray(category.id, placed)))
    .orderBy(asc(category.position), asc(category.id));

  return rows.map((row, index) => [position + index, "category", row.id]);
}

/** A page's sequence and cover, short. */
async function placesOf(tx: DatabaseClient, pageId: number) {
  const sections = await tx
    .select({
      bannerId: pageSection.bannerId,
      categoryId: pageSection.categoryId,
      kind: pageSection.kind,
      position: pageSection.position,
    })
    .from(pageSection)
    .where(eq(pageSection.pageId, pageId))
    .orderBy(asc(pageSection.position));
  const cover = await tx
    .select({
      bannerId: pageCoverBanner.bannerId,
      position: pageCoverBanner.position,
    })
    .from(pageCoverBanner)
    .where(eq(pageCoverBanner.pageId, pageId))
    .orderBy(asc(pageCoverBanner.position));

  return {
    cover: cover.map((row) => [row.position, row.bannerId]),
    sections: sections.map((row) => [
      row.position,
      row.kind,
      row.bannerId ?? row.categoryId,
    ]),
  };
}

describe("migration 0021: the home becomes a page", () => {
  test("gives the store a home page, copies its places in order (the unplaced categories, then an unplaced banner, last), and converges when replayed", async () => {
    await rolledBack(async (tx, storeId) => {
      const shelfId = await addCategory(tx, storeId, 10_000);
      // Two with no place, made in the reverse of their own order.
      const later = await addCategory(tx, storeId, 10_002);
      const sooner = await addCategory(tx, storeId, 10_001);
      const second = await addOldBanner(tx, storeId, { coverPosition: 1 });
      const first = await addOldBanner(tx, storeId, { coverPosition: 0 });
      const between = await addOldBanner(tx, storeId, "rows");
      const unplaced = await addOldBanner(tx, storeId, "rows");
      // Positions as FER-020 numbered them, with a gap to close.
      await tx.insert(homeSection).values([
        { kind: "featured", position: 0, storeId },
        { categoryId: shelfId, kind: "category", position: 2, storeId },
        { bannerId: between, kind: "banner", position: 3, storeId },
        { kind: "best_sellers", position: 5, storeId },
      ]);
      const pagesBefore = await tx.$count(page, eq(page.storeId, storeId));

      await applyMigration(tx);
      const home = await homeOf(tx, storeId);
      await applyMigration(tx);

      expect(home).not.toBeNull();
      // A second run adds no page and moves the home nowhere.
      expect(await homeOf(tx, storeId)).toBe(home);
      expect(await tx.$count(page, eq(page.storeId, storeId))).toBe(
        pagesBefore + 1
      );
      // FER-020's home showed the categories with no place before the
      // banner with none: the copy keeps that order.
      const categories = await unplacedCategories(tx, storeId, {
        placed: [shelfId],
        position: 4,
      });
      expect(
        categories
          .map((section) => section[2])
          .filter((id) => id === sooner || id === later)
      ).toEqual([sooner, later]);
      expect(await placesOf(tx, home ?? 0)).toEqual({
        cover: [
          [0, first],
          [1, second],
        ],
        sections: [
          [0, "featured", null],
          [1, "category", shelfId],
          [2, "banner", between],
          [3, "best_sellers", null],
          ...categories,
          [4 + categories.length, "banner", unplaced],
        ],
      });
    });
  });

  test("places no category when no banner is left without a place", async () => {
    await rolledBack(async (tx, storeId) => {
      const shelfId = await addCategory(tx, storeId, 10_000);
      await addCategory(tx, storeId, 9999);
      const between = await addOldBanner(tx, storeId, "rows");
      await tx.insert(homeSection).values([
        { categoryId: shelfId, kind: "category", position: 0, storeId },
        { bannerId: between, kind: "banner", position: 1, storeId },
      ]);

      await applyMigration(tx);

      // The resolver adds them after the saved places, as FER-020's did.
      expect(
        (await placesOf(tx, (await homeOf(tx, storeId)) ?? 0)).sections
      ).toEqual([
        [0, "category", shelfId],
        [1, "banner", between],
      ]);
    });
  });

  test("gives a store with nothing curated an empty home page", async () => {
    await rolledBack(async (tx, storeId) => {
      await applyMigration(tx);
      const home = await homeOf(tx, storeId);

      expect(home).not.toBeNull();
      expect(await placesOf(tx, home ?? 0)).toEqual({
        cover: [],
        sections: [],
      });
    });
  });

  test("leaves a store that already has its home page alone", async () => {
    await rolledBack(async (tx, storeId) => {
      const [own] = await tx
        .insert(page)
        .values({ slug: `own-${uniqueTag()}`, storeId })
        .returning({ id: page.id });
      const pageId = own?.id ?? 0;
      await tx
        .update(store)
        .set({ homePageId: pageId })
        .where(eq(store.id, storeId));
      await tx
        .insert(pageSection)
        .values({ kind: "featured", pageId, position: 0, storeId });
      const cover = await addOldBanner(tx, storeId, { coverPosition: 0 });
      await tx
        .insert(homeSection)
        .values({ kind: "best_sellers", position: 0, storeId });

      await applyMigration(tx);

      expect(await homeOf(tx, storeId)).toBe(pageId);
      // Its sequence, already written, is kept; its empty cover is filled.
      expect((await placesOf(tx, pageId)).sections).toEqual([
        [0, "featured", null],
      ]);
      expect((await placesOf(tx, pageId)).cover).toEqual([[0, cover]]);
    });
  });
});
