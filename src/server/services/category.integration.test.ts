import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createStoreSchema } from "@/lib/schemas/store";
import { db } from "@/server/db";
import { product, store } from "@/server/db/schema";
import { createProduct } from "@/server/services/catalog";
import { createStore } from "@/server/services/store";

import {
  createCategory,
  deleteCategory,
  listStoreCategories,
  renameCategory,
  reorderCategories,
} from "./category";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Deleting a store cascades to its categories, articles and texts.
const createdStoreIds: number[] = [];

afterEach(async () => {
  await db.delete(store).where(inArray(store.id, createdStoreIds.splice(0)));
});

async function makeStore() {
  const row = await createStore(
    db,
    createStoreSchema.parse({
      colorAccent: "#c8f31d",
      colorBackground: "#f2f3f0",
      colorContrast: "#111312",
      colorForeground: "#111312",
      colorSurface: "#ffffff",
      currencyCode: "UYU",
      instagramUrl: null,
      isActive: true,
      isDefault: false,
      logoUrl: null,
      name: "Category Test",
      slug: `category-${randomUUID().slice(0, 8)}`,
      tiktokUrl: null,
      translations: [],
      whatsappNumber: null,
    })
  );
  createdStoreIds.push(row.id);

  return row;
}

const add = async (
  storeId: number,
  nameEs: string,
  nameEn: string | null = null
) =>
  await db.transaction(
    async (tx) =>
      await createCategory(tx, { storeId, values: { nameEn, nameEs } })
  );

async function addArticle(storeId: number, categoryId: number, title: string) {
  return await createProduct(db, {
    storeId,
    values: {
      categoryId,
      isAvailable: true,
      priceAmount: 1000,
      translations: [
        {
          description: "",
          locale: "es",
          seoDescription: null,
          seoTitle: null,
          title,
        },
      ],
    },
  });
}

describe("category management", () => {
  test("adds categories at the end, slugs from the Spanish name, English optional", async () => {
    const shop = await makeStore();
    await add(shop.id, "Collares Dorados", "Gold necklaces");
    await add(shop.id, "Anillos");

    expect(await listStoreCategories(db, { storeId: shop.id })).toMatchObject([
      {
        nameEn: "Gold necklaces",
        nameEs: "Collares Dorados",
        position: 0,
        productCount: 0,
        slug: "collares-dorados",
      },
      {
        nameEn: null,
        nameEs: "Anillos",
        position: 1,
        productCount: 0,
        slug: "anillos",
      },
    ]);
  });

  test("refuses a Spanish name the store already has, whatever its case or accents, but not another store's", async () => {
    const [shop, other] = [await makeStore(), await makeStore()];
    await add(shop.id, "Pulseras");
    const duplicate = {
      code: "CONFLICT",
      message: "Another category of this store already has that name",
    };

    await expect(add(shop.id, "pulseras")).rejects.toMatchObject(duplicate);
    await expect(add(shop.id, "PULSERÁS")).rejects.toMatchObject(duplicate);
    await expect(add(other.id, "Pulseras")).resolves.toMatchObject({
      slug: "pulseras",
    });
  });

  test("renaming keeps the slug and the place, and refuses another category's name", async () => {
    const shop = await makeStore();
    const rings = await add(shop.id, "Anillos");
    await add(shop.id, "Aros");

    await db.transaction(
      async (tx) =>
        await renameCategory(tx, {
          id: rings.id,
          storeId: shop.id,
          values: { nameEn: "Rings", nameEs: "Anillos de plata" },
        })
    );
    expect(
      (await listStoreCategories(db, { storeId: shop.id }))[0]
    ).toMatchObject({
      nameEn: "Rings",
      nameEs: "Anillos de plata",
      position: 0,
      slug: "anillos",
    });

    await expect(
      db.transaction(
        async (tx) =>
          await renameCategory(tx, {
            id: rings.id,
            storeId: shop.id,
            values: { nameEn: null, nameEs: "aros" },
          })
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("reorders all categories at once, and refuses a partial or foreign list", async () => {
    const [shop, other] = [await makeStore(), await makeStore()];
    const a = await add(shop.id, "A");
    const b = await add(shop.id, "B");
    const c = await add(shop.id, "C");
    const foreign = await add(other.id, "Z");

    await db.transaction(
      async (tx) =>
        await reorderCategories(tx, {
          ids: [c.id, a.id, b.id],
          storeId: shop.id,
        })
    );
    expect(
      (await listStoreCategories(db, { storeId: shop.id })).map(
        (row) => row.nameEs
      )
    ).toEqual(["C", "A", "B"]);

    for (const ids of [
      [a.id, b.id],
      [a.id, b.id, foreign.id],
    ]) {
      await expect(
        db.transaction(
          async (tx) => await reorderCategories(tx, { ids, storeId: shop.id })
        )
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Give every category of the store, once each",
      });
    }
  });

  test("deleting a category with articles moves them first, and refuses without a destination", async () => {
    const shop = await makeStore();
    const chains = await add(shop.id, "Cadenas");
    const rings = await add(shop.id, "Anillos");
    const article = await addArticle(shop.id, chains.id, "Cadena");
    const remove = async (moveToId: number | null) =>
      await db.transaction(
        async (tx) =>
          await deleteCategory(tx, {
            id: chains.id,
            moveToId,
            storeId: shop.id,
          })
      );

    expect(
      (await listStoreCategories(db, { storeId: shop.id }))[0]?.productCount
    ).toBe(1);
    await expect(remove(null)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Choose where its articles move before deleting it",
    });
    await expect(remove(chains.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Choose another category for its articles",
    });

    await expect(remove(rings.id)).resolves.toEqual({
      id: chains.id,
      movedArticles: 1,
    });
    expect(
      (await db.query.product.findFirst({ where: eq(product.id, article.id) }))
        ?.categoryId
    ).toBe(rings.id);
    expect(
      (await listStoreCategories(db, { storeId: shop.id })).map(
        (row) => row.nameEs
      )
    ).toEqual(["Anillos"]);
  });

  test("another store's category is NOT_FOUND as a target or a destination", async () => {
    const [shop, other] = [await makeStore(), await makeStore()];
    const own = await add(shop.id, "Cadenas");
    const foreign = await add(other.id, "Anillos");
    await addArticle(shop.id, own.id, "Cadena");
    const notFound = { code: "NOT_FOUND", message: "Category not found" };

    await expect(
      db.transaction(
        async (tx) =>
          await deleteCategory(tx, {
            id: foreign.id,
            moveToId: null,
            storeId: shop.id,
          })
      )
    ).rejects.toMatchObject(notFound);
    await expect(
      db.transaction(
        async (tx) =>
          await deleteCategory(tx, {
            id: own.id,
            moveToId: foreign.id,
            storeId: shop.id,
          })
      )
    ).rejects.toMatchObject(notFound);
    await expect(
      db.transaction(
        async (tx) =>
          await renameCategory(tx, {
            id: foreign.id,
            storeId: shop.id,
            values: { nameEn: null, nameEs: "Robado" },
          })
      )
    ).rejects.toMatchObject(notFound);
  });
});

/** A promise and the function that settles it, for ordering two writers. */
function deferred() {
  let settle: (value: undefined) => void = () => undefined;
  const promise = new Promise<undefined>((resolve) => {
    settle = resolve;
  });

  return { promise, resolve: settle };
}

/** Waits until some query on this database waits on another's lock. */
async function waitUntilBlocked() {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const result = await db.execute<{ blocked: number }>(sql`
      select count(*)::int as blocked
      from pg_stat_activity
      where datname = current_database()
        and cardinality(pg_blocking_pids(pid)) > 0
    `);

    if ((result.rows[0]?.blocked ?? 0) > 0) {
      return;
    }
  }

  throw new Error("The second writer never waited on the category lock");
}

/**
 * Two creations in one store, the second started while the first holds the
 * store's category lock: it waits, then decides on what the first wrote.
 */
async function overlappingCreations(storeId: number, names: [string, string]) {
  const held = deferred();
  const locked = deferred();
  const first = db.transaction(async (tx) => {
    const created = await createCategory(tx, {
      storeId,
      values: { nameEn: null, nameEs: names[0] },
    });
    locked.resolve(undefined);
    await held.promise;

    return created;
  });
  await locked.promise;
  const second = db.transaction(
    async (tx) =>
      await createCategory(tx, {
        storeId,
        values: { nameEn: null, nameEs: names[1] },
      })
  );

  try {
    await waitUntilBlocked();
  } finally {
    held.resolve(undefined);
  }

  return await Promise.allSettled([first, second]);
}

describe("category writes under two writers", () => {
  test("the same name created twice at once ends in one category and one CONFLICT", async () => {
    const shop = await makeStore();

    const [first, second] = await overlappingCreations(shop.id, [
      "Collares",
      "collares",
    ]);

    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({
      reason: { code: "CONFLICT" },
      status: "rejected",
    });
    expect(
      (await listStoreCategories(db, { storeId: shop.id })).map(
        (row) => row.nameEs
      )
    ).toEqual(["Collares"]);
  });

  test("two different names created at once get their own places", async () => {
    const shop = await makeStore();

    await overlappingCreations(shop.id, ["Collares", "Pulseras"]);

    expect(
      (await listStoreCategories(db, { storeId: shop.id })).map((row) => [
        row.nameEs,
        row.position,
      ])
    ).toEqual([
      ["Collares", 0],
      ["Pulseras", 1],
    ]);
  });
});
