import { eq, inArray } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";

import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { store, storeTranslation, user } from "@/server/db/schema";

import { SEED_MEMBERS, SEED_STORES, SEED_USER, seed } from "./seed";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const SEED_EMAILS = [SEED_USER, ...SEED_MEMBERS].map(({ email }) => email);

async function deleteSeedUsers() {
  // Cascades to their sessions, accounts, posts and memberships.
  await db.delete(user).where(inArray(user.email, SEED_EMAILS));
}

const SEED_SLUGS = SEED_STORES.map((seedStore) => seedStore.slug);

// The seed stores a test's own `seed()` call reported creating. The clone may
// already hold them (the template database is seeded), and those are not this
// file's to delete: only the ones captured here are.
const createdStoreSlugs: string[] = [];

/** Runs the seed on the worker's database and keeps what it says it created. */
async function runSeed() {
  const result = await seed({
    auth,
    databaseUrl: process.env.DATABASE_URL,
    db,
    nodeEnv: "test",
  });
  createdStoreSlugs.push(...result.createdStores);

  return result;
}

const ROLLED_BACK = "Rolled back on purpose: this test keeps nothing";

afterEach(async () => {
  await deleteSeedUsers();
  // Cascades to their texts.
  await db
    .delete(store)
    .where(inArray(store.slug, createdStoreSlugs.splice(0)));
});

// Runs the seed against the migrated schema, so a constraint or column the
// seed no longer satisfies fails here instead of in the next fresh worktree.
test("leaves three logins that sign in with their roles, and a second run changes nothing", async () => {
  // This worker's clone may carry the template's seed users: start without them.
  await deleteSeedUsers();

  const first = await runSeed();
  const second = await runSeed();

  expect(first.createdAccounts).toEqual(SEED_EMAILS);
  expect(second).toEqual({
    createdAccounts: [],
    createdPost: false,
    createdStores: [],
  });
  expect(
    await db.query.user.findMany({
      columns: { email: true, role: true },
      orderBy: user.email,
      where: inArray(user.email, SEED_EMAILS),
      with: {
        storeMemberships: {
          columns: {},
          with: { store: { columns: { slug: true } } },
        },
      },
    })
  ).toEqual([
    {
      email: "member@example.com",
      role: "member",
      storeMemberships: [{ store: { slug: "lr-market" } }],
    },
    {
      email: "multi@example.com",
      role: "member",
      storeMemberships: expect.arrayContaining([
        { store: { slug: "lr-market" } },
        { store: { slug: "tienda-demo" } },
      ]),
    },
    { email: "test@example.com", role: "superadmin", storeMemberships: [] },
  ]);

  const users = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, SEED_USER.email));
  const signedIn = await auth.api.signInEmail({
    body: { email: SEED_USER.email, password: SEED_USER.password },
  });
  expect(users).toEqual([{ id: signedIn.user.id }]);
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
