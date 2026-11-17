import { and, eq } from "drizzle-orm";
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
      catalogPages: { covers: 0, grouped: 0, groups: 0 },
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
    expect([first.createdArticles, second.createdArticles]).toEqual([49, 0]);
    const seeded = await tx.query.store.findFirst({
      columns: { name: true },
      where: eq(store.id, storeId),
      with: {
        categories: {
          columns: { slug: true },
          orderBy: category.position,
          with: { parent: { columns: { slug: true } } },
        },
        products: {
          columns: { position: true, slug: true, status: true },
          orderBy: product.position,
          with: { images: { columns: { id: true } } },
        },
        translations: {
          columns: { locale: true },
          orderBy: storeTranslation.locale,
        },
      },
    });
    expect(seeded?.name).toBe(before?.name);
    // The bubble guns first, in no group; then Bijouterie, holding four
    // (FER-043), so the header reads them in Lucas's order (FER-044).
    expect(
      seeded?.categories.map(({ parent, slug }) => [slug, parent?.slug ?? null])
    ).toEqual([
      ["burbujeros", null],
      ["bijouterie", null],
      ["cadenas", "bijouterie"],
      ["anillos", "bijouterie"],
      ["aros", "bijouterie"],
      ["pulseras", "bijouterie"],
    ]);
    const products = seeded?.products ?? [];
    expect(products.map(({ status }) => status)).toEqual(
      Array.from({ length: 49 }, () => "published")
    );
    // Numbered in the order they were made, which mixes the categories.
    expect(products.slice(0, 5).map(({ slug }) => slug)).toEqual([
      "burbujero-cristal",
      "cadena-corazones",
      "anillo-solitario",
      "aros-abotonados",
      "par-de-esclavas",
    ]);
    expect(
      products
        .filter(({ images }) => images.length >= 4)
        .map(({ slug }) => slug)
    ).toEqual([
      "cadena-corazones",
      "par-de-esclavas",
      "burbujero-pez",
      "anillo-halo",
      "aros-argolla-gruesa",
      "pulsera-eslabones",
      "cadena-con-chapita",
    ]);
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

// A database seeded before FER-043 has its five categories in no group and
// no covers: the next seed gives it the group, last (FER-044), and the
// covers, and keeps every article where it was.
test("gives a catalog seeded before groups its Bijouterie, last, and its covers", async () => {
  const run = db.transaction(async (tx) => {
    const storeId = await theStoreId(tx);
    await emptyStore(tx, storeId);
    await runSeed(tx);
    // Back to how the earlier seed left it.
    await tx
      .update(category)
      .set({
        coverHeight: null,
        coverPhoneHeight: null,
        coverPhoneUrl: null,
        coverPhoneWidth: null,
        coverUrl: null,
        coverWidth: null,
        parentId: null,
      })
      .where(eq(category.storeId, storeId));
    await tx
      .delete(category)
      .where(
        and(eq(category.storeId, storeId), eq(category.slug, "bijouterie"))
      );
    // The earlier seed's order: the four jewelry categories, then the
    // bubble guns.
    for (const [position, slug] of [
      "cadenas",
      "anillos",
      "aros",
      "pulseras",
      "burbujeros",
    ].entries()) {
      await tx
        .update(category)
        .set({ position })
        .where(and(eq(category.storeId, storeId), eq(category.slug, slug)));
    }
    await tx
      .update(store)
      .set({
        catalogCoverHeight: null,
        catalogCoverUrl: null,
        catalogCoverWidth: null,
        catalogCoverPhoneHeight: null,
        catalogCoverPhoneUrl: null,
        catalogCoverPhoneWidth: null,
      })
      .where(eq(store.id, storeId));

    const upgraded = await runSeed(tx);

    expect(upgraded.catalogPages).toEqual({ covers: 7, grouped: 4, groups: 1 });
    const categories = await tx.query.category.findMany({
      columns: { coverUrl: true, position: true, slug: true },
      orderBy: category.position,
      where: eq(category.storeId, storeId),
      with: { parent: { columns: { slug: true } } },
    });
    expect(
      categories.map(({ coverUrl, parent, slug }) => [
        slug,
        parent?.slug ?? null,
        coverUrl,
      ])
    ).toEqual([
      ["cadenas", "bijouterie", "/seed/necklace-1.jpg"],
      ["anillos", "bijouterie", "/seed/ring-2.jpg"],
      ["aros", "bijouterie", "/seed/earrings-2.jpg"],
      ["pulseras", "bijouterie", "/seed/bracelet-2.jpg"],
      ["burbujeros", null, "/seed/bubble-gun-1.jpg"],
      ["bijouterie", null, "/seed/necklace-2.jpg"],
    ]);
    // The group takes the place after the last; no other category moves,
    // so the header reads the bubble guns, then Bijouterie.
    expect(categories.map(({ position }) => position)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    const [cover] = await tx
      .select({ url: store.catalogCoverUrl })
      .from(store)
      .where(eq(store.id, storeId));
    expect(cover?.url).toBe("/seed/ring-3.jpg");

    throw new Error(ROLLED_BACK);
  });

  await expect(run).rejects.toThrow(ROLLED_BACK);
});
