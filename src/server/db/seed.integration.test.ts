import { eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";

import { auth } from "@/server/better-auth/config";
import { type DatabaseClient, db } from "@/server/db";
import {
  attribute,
  category,
  product,
  store,
  storeTranslation,
  user,
} from "@/server/db/schema";
import { theStoreId } from "@/server/test/one-store";

import { SEED_USER, seed } from "./seed";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const ROLLED_BACK = "Rolled back on purpose: this test keeps nothing";

/** The seed run as `pnpm db:seed` runs it, on `tx`, against a local database. */
async function runSeed(tx: DatabaseClient) {
  return await seed({
    auth,
    databaseUrl: process.env.DATABASE_URL,
    db: tx,
    nodeEnv: "test",
  });
}

/**
 * The store as a fresh database has it: no texts and no catalog. Articles
 * first, since a category that still has one cannot be deleted.
 */
async function emptyStore(tx: DatabaseClient, storeId: number) {
  await tx.delete(product).where(eq(product.storeId, storeId));
  await tx.delete(attribute).where(eq(attribute.storeId, storeId));
  await tx.delete(category).where(eq(category.storeId, storeId));
  await tx
    .delete(storeTranslation)
    .where(eq(storeTranslation.storeId, storeId));
}

// Runs the seed against the migrated schema, so a constraint or column the
// seed no longer satisfies fails here instead of in the next fresh worktree.
// Inside a transaction that is rolled back: the test needs a database without
// the seed's rows, and the clone's own are put back untouched.
test("leaves one login with its credential, and a second run creates nothing", async () => {
  const run = db.transaction(async (tx) => {
    await tx.delete(user).where(eq(user.email, SEED_USER.email));
    await emptyStore(tx, await theStoreId(tx));

    const first = await runSeed(tx);
    const second = await runSeed(tx);

    expect(first.createdAccounts).toEqual([SEED_USER.email]);
    expect(second).toEqual({
      createdAccounts: [],
      createdArticles: 0,
      createdStoreTexts: [],
    });
    expect(
      await tx.query.user.findMany({
        columns: { email: true },
        where: eq(user.email, SEED_USER.email),
        with: { accounts: { columns: { providerId: true } } },
      })
    ).toEqual([
      { accounts: [{ providerId: "credential" }], email: SEED_USER.email },
    ]);

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation above rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
});

test("gives the one store its texts in both languages and its sample catalog, once, and leaves its name alone", async () => {
  const run = db.transaction(async (tx) => {
    const storeId = await theStoreId(tx);
    const [before] = await tx
      .select({ name: store.name })
      .from(store)
      .where(eq(store.id, storeId));
    await emptyStore(tx, storeId);

    const first = await runSeed(tx);
    const second = await runSeed(tx);

    expect([first.createdStoreTexts, second.createdStoreTexts]).toEqual([
      ["es", "en"],
      [],
    ]);
    expect([first.createdArticles, second.createdArticles]).toEqual([11, 0]);
    const seeded = await tx.query.store.findFirst({
      columns: { name: true },
      where: eq(store.id, storeId),
      with: {
        categories: { columns: { slug: true }, orderBy: category.position },
        products: { columns: { status: true } },
        translations: {
          columns: { locale: true },
          orderBy: storeTranslation.locale,
        },
      },
    });
    expect(seeded?.name).toBe(before?.name);
    expect(seeded?.categories.map(({ slug }) => slug)).toEqual([
      "burbujeros",
      "cadenas",
      "anillos",
      "aros",
      "pulseras",
    ]);
    expect(seeded?.products.map(({ status }) => status)).toEqual(
      Array.from({ length: 11 }, () => "published")
    );
    expect(seeded?.translations.map(({ locale }) => locale)).toEqual([
      "es",
      "en",
    ]);
    // Still one store: the seed adds to it, never beside it.
    expect(await tx.select({ id: store.id }).from(store)).toEqual([
      { id: storeId },
    ]);

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation above rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
});
