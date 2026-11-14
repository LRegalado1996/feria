import { eq, inArray } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";

import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { store, storeTranslation, user } from "@/server/db/schema";

import { SEED_STORES, SEED_USER, seed } from "./seed";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

async function deleteSeedUser() {
  // Cascades to its sessions, accounts and posts.
  await db.delete(user).where(eq(user.email, SEED_USER.email));
}

const SEED_SLUGS = SEED_STORES.map((seedStore) => seedStore.slug);

async function deleteSeedStores() {
  // By their exact addresses; cascades to their texts.
  await db.delete(store).where(inArray(store.slug, SEED_SLUGS));
}

afterEach(async () => {
  await deleteSeedUser();
  await deleteSeedStores();
});

// Runs the seed against the migrated schema, so a constraint or column the
// seed no longer satisfies fails here instead of in the next fresh worktree.
test("leaves one login that signs in, and a second run changes nothing", async () => {
  // This worker's clone may carry the template's seed user: start without it.
  await deleteSeedUser();

  const first = await seed({ auth, db, nodeEnv: "test" });
  const second = await seed({ auth, db, nodeEnv: "test" });

  expect(first).toMatchObject({ email: SEED_USER.email, createdUser: true });
  expect(second).toEqual({
    email: SEED_USER.email,
    createdUser: false,
    createdPost: false,
    createdStores: [],
  });

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
  // This worker's clone may carry the seed stores: start without them.
  await deleteSeedStores();

  const first = await seed({ auth, db, nodeEnv: "test" });
  const second = await seed({ auth, db, nodeEnv: "test" });

  expect(first.createdStores).toEqual(["lr-market", "tienda-demo"]);
  expect(second.createdStores).toEqual([]);

  const stores = await db.query.store.findMany({
    columns: { colorAccent: true, isActive: true, name: true, slug: true },
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
      locales: ["es", "en"],
      name: "LR Market",
      slug: "lr-market",
    },
    {
      colorAccent: "#ff8a3d",
      isActive: true,
      locales: ["es", "en"],
      name: "Tienda Demo",
      slug: "tienda-demo",
    },
  ]);
});
