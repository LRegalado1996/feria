import { inArray } from "drizzle-orm";
import { expect, test, vi } from "vitest";

import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import {
  category,
  store,
  storeMember,
  storeTranslation,
  user,
} from "@/server/db/schema";

import { SEED_MEMBERS, SEED_STORES, SEED_USER, seed } from "./seed";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const SEED_EMAILS = [SEED_USER, ...SEED_MEMBERS].map(({ email }) => email);

const SEED_SLUGS = SEED_STORES.map((seedStore) => seedStore.slug);

const ROLLED_BACK = "Rolled back on purpose: this test keeps nothing";

// Runs the seed against the migrated schema, so a constraint or column the
// seed no longer satisfies fails here instead of in the next fresh worktree.
// Inside a transaction that is rolled back: the test needs a database
// without the seed logins, and the clone's own are put back untouched.
test("leaves three logins with their roles, credentials and memberships, and a second run changes nothing", async () => {
  const run = db.transaction(async (tx) => {
    await tx.delete(user).where(inArray(user.email, SEED_EMAILS));
    const options = {
      auth,
      databaseUrl: process.env.DATABASE_URL,
      db: tx,
      nodeEnv: "test",
    };

    const first = await seed(options);
    const second = await seed(options);

    expect(first.createdAccounts).toEqual(SEED_EMAILS);
    expect(second).toEqual({
      createdAccounts: [],
      createdArticles: 0,
      createdPost: false,
      createdStores: [],
    });
    expect(
      await tx.query.user.findMany({
        columns: { email: true, role: true },
        orderBy: user.email,
        where: inArray(user.email, SEED_EMAILS),
        with: {
          accounts: { columns: { providerId: true } },
          storeMemberships: {
            columns: {},
            // The seed creates lr-market first, so its id is the lower one.
            orderBy: storeMember.storeId,
            with: { store: { columns: { slug: true } } },
          },
        },
      })
    ).toEqual([
      {
        accounts: [{ providerId: "credential" }],
        email: "member@example.com",
        role: "member",
        storeMemberships: [{ store: { slug: "lr-market" } }],
      },
      {
        accounts: [{ providerId: "credential" }],
        email: "multi@example.com",
        role: "member",
        storeMemberships: [
          { store: { slug: "lr-market" } },
          { store: { slug: "tienda-demo" } },
        ],
      },
      {
        accounts: [{ providerId: "credential" }],
        email: "test@example.com",
        role: "superadmin",
        storeMemberships: [],
      },
    ]);

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation above rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
});

test("leaves two active stores with different palettes and texts in both languages, once", async () => {
  // Inside a transaction that is rolled back: the test needs a database
  // without the seed stores, and the clone's own are put back untouched.
  const run = db.transaction(async (tx) => {
    await tx.delete(store).where(inArray(store.slug, SEED_SLUGS));

    const first = await seed({
      auth,
      databaseUrl: process.env.DATABASE_URL,
      db: tx,
      nodeEnv: "test",
    });
    const second = await seed({
      auth,
      databaseUrl: process.env.DATABASE_URL,
      db: tx,
      nodeEnv: "test",
    });

    expect(first.createdStores).toEqual(["lr-market", "tienda-demo"]);
    expect(second.createdStores).toEqual([]);
    expect([first.createdArticles, second.createdArticles]).toEqual([11, 0]);
    const lrMarket = await tx.query.store.findFirst({
      where: eq(store.slug, "lr-market"),
      with: {
        categories: { columns: { slug: true }, orderBy: category.position },
        products: { columns: { status: true } },
      },
    });
    expect(lrMarket?.categories.map(({ slug }) => slug)).toEqual([
      "burbujeros",
      "cadenas",
      "anillos",
      "aros",
      "pulseras",
    ]);
    expect(lrMarket?.products.map(({ status }) => status)).toEqual(
      Array.from({ length: 11 }, () => "published")
    );

    const stores = await tx.query.store.findMany({
      columns: {
        colorAccent: true,
        isActive: true,
        isDefault: true,
        name: true,
        slug: true,
      },
      orderBy: store.slug,
      where: inArray(store.slug, SEED_SLUGS),
      with: {
        translations: {
          columns: { locale: true },
          orderBy: storeTranslation.locale,
        },
      },
    });
    expect(
      stores.map(({ translations, ...columns }) => ({
        ...columns,
        locales: translations.map(({ locale }) => locale),
      }))
    ).toEqual([
      {
        colorAccent: "#c8f31d",
        isActive: true,
        isDefault: true,
        locales: ["es", "en"],
        name: "LR Market",
        slug: "lr-market",
      },
      {
        colorAccent: "#ff8a3d",
        isActive: true,
        isDefault: false,
        locales: ["es", "en"],
        name: "Tienda Demo",
        slug: "tienda-demo",
      },
    ]);

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation above rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
});
