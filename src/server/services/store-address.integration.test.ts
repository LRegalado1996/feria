import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { type DatabaseClient, db } from "@/server/db";
import { category, page, store } from "@/server/db/schema";
import { theStoreId, uniqueTag } from "@/server/test/one-store";

import { listStoreAddresses } from "./store-address";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const ROLLED_BACK = "Rolled back on purpose: this test keeps nothing";

/** Runs `work` on the store in a transaction that is rolled back. */
async function rolledBack(
  work: (tx: DatabaseClient, storeId: number) => Promise<void>
) {
  const run = db.transaction(async (tx) => {
    await work(tx, await theStoreId(tx));

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation inside rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
}

describe("listStoreAddresses on real rows", () => {
  test("lists a group, its category under it, a loose category, a draft and the home the store points at", async () => {
    await rolledBack(async (tx, storeId) => {
      const tag = uniqueTag();
      const [group] = await tx
        .insert(category)
        .values({ position: 900, slug: `grupo-${tag}`, storeId })
        .returning({ id: category.id });
      await tx.insert(category).values([
        {
          parentId: group?.id,
          position: 901,
          slug: `hijo-${tag}`,
          storeId,
        },
        { position: 902, slug: `suelta-${tag}`, storeId },
      ]);
      const [draft, home] = await tx
        .insert(page)
        .values([
          { isPublished: false, slug: `borrador-${tag}`, storeId },
          { isPublished: true, slug: `portada-${tag}`, storeId },
        ])
        .returning({ id: page.id });
      await tx
        .update(store)
        .set({ homePageId: home?.id })
        .where(eq(store.id, storeId));

      const addresses = await listStoreAddresses(tx);

      expect(addresses?.categories).toEqual(
        expect.arrayContaining([
          { path: `/grupo-${tag}`, slug: `grupo-${tag}` },
          { path: `/grupo-${tag}/hijo-${tag}`, slug: `hijo-${tag}` },
          { path: `/suelta-${tag}`, slug: `suelta-${tag}` },
        ])
      );
      expect(addresses?.pages).toEqual(
        expect.arrayContaining([
          { isHome: false, isPublished: false, slug: `borrador-${tag}` },
          { isHome: true, isPublished: true, slug: `portada-${tag}` },
        ])
      );
      // One home only: the one the store's row names.
      expect(addresses?.pages.filter((entry) => entry.isHome)).toEqual([
        { isHome: true, isPublished: true, slug: `portada-${tag}` },
      ]);
      expect(draft).toBeDefined();
    });
  });
});
