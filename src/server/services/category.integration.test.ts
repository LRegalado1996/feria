import { eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import { category, product } from "@/server/db/schema";
import { createProduct } from "@/server/services/catalog";
import { onlyIds, theStoreId, uniqueTag } from "@/server/test/one-store";

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

// The store is shared (`theStoreId`): what this file created is deleted by
// id after each test, the articles first, since a category that still has
// one cannot be deleted. Deleting a category takes its names with it.
const created = { categoryIds: [] as number[], productIds: [] as number[] };

afterEach(async () => {
  await db
    .delete(product)
    .where(inArray(product.id, created.productIds.splice(0)));
  await db
    .delete(category)
    .where(inArray(category.id, created.categoryIds.splice(0)));
});

const add = async (
  storeId: number,
  nameEs: string,
  nameEn: string | null = null
) => {
  const row = await db.transaction(
    async (tx) =>
      await createCategory(tx, { storeId, values: { nameEn, nameEs } })
  );
  created.categoryIds.push(row.id);

  return row;
};

async function addArticle(storeId: number, categoryId: number, title: string) {
  const row = await createProduct(db, {
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
  created.productIds.push(row.id);

  return row;
}

/** The last place in the store's list now, -1 for none. */
async function lastPosition(storeId: number) {
  return Math.max(
    -1,
    ...(await listStoreCategories(db, { storeId })).map((row) => row.position)
  );
}

describe("category management", () => {
  test("adds categories at the end, slugs from the Spanish name, English optional", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const last = await lastPosition(storeId);
    const gold = await add(
      storeId,
      `Collares Dorados ${tag}`,
      "Gold necklaces"
    );
    const rings = await add(storeId, `Anillos ${tag}`);

    expect(
      onlyIds(await listStoreCategories(db, { storeId }), [gold.id, rings.id])
    ).toMatchObject([
      {
        nameEn: "Gold necklaces",
        nameEs: `Collares Dorados ${tag}`,
        position: last + 1,
        productCount: 0,
        slug: `collares-dorados-${tag}`,
      },
      {
        nameEn: null,
        nameEs: `Anillos ${tag}`,
        position: last + 2,
        productCount: 0,
        slug: `anillos-${tag}`,
      },
    ]);
  });

  test("refuses a Spanish name the store already has, whatever its case or accents, and takes another", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    await add(storeId, `Pulseras ${tag}`);
    const duplicate = {
      code: "CONFLICT",
      message: "Another category of this store already has that name",
    };

    await expect(add(storeId, `pulseras ${tag}`)).rejects.toMatchObject(
      duplicate
    );
    await expect(
      add(storeId, `PULSERÁS ${tag.toUpperCase()}`)
    ).rejects.toMatchObject(duplicate);
    await expect(add(storeId, `Pulseras finas ${tag}`)).resolves.toMatchObject({
      slug: `pulseras-finas-${tag}`,
    });
  });

  test("renaming keeps the slug and the place, and refuses another category's name", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const rings = await add(storeId, `Anillos ${tag}`);
    await add(storeId, `Aros ${tag}`);

    await db.transaction(
      async (tx) =>
        await renameCategory(tx, {
          id: rings.id,
          storeId,
          values: { nameEn: "Rings", nameEs: `Anillos de plata ${tag}` },
        })
    );
    expect(
      onlyIds(await listStoreCategories(db, { storeId }), [rings.id])
    ).toMatchObject([
      {
        nameEn: "Rings",
        nameEs: `Anillos de plata ${tag}`,
        position: rings.position,
        slug: `anillos-${tag}`,
      },
    ]);

    await expect(
      db.transaction(
        async (tx) =>
          await renameCategory(tx, {
            id: rings.id,
            storeId,
            values: { nameEn: null, nameEs: `aros ${tag}` },
          })
      )
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Another category of this store already has that name",
    });
  });

  test("reorders all categories at once, and refuses a partial list or one with an id the store does not have", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const a = await add(storeId, `A ${tag}`);
    const b = await add(storeId, `B ${tag}`);
    const c = await add(storeId, `C ${tag}`);
    const gone = await add(storeId, `Gone ${tag}`);
    await db.transaction(
      async (tx) =>
        await deleteCategory(tx, { id: gone.id, moveToId: null, storeId })
    );
    const rest = (await listStoreCategories(db, { storeId }))
      .map((row) => row.id)
      .filter((id) => ![a.id, b.id, c.id].includes(id));
    const reorder = async (ids: number[]) =>
      await db.transaction(
        async (tx) => await reorderCategories(tx, { ids, storeId })
      );

    await reorder([c.id, a.id, b.id, ...rest]);
    expect(
      (await listStoreCategories(db, { storeId }))
        .slice(0, 3)
        .map((row) => row.nameEs)
    ).toEqual([`C ${tag}`, `A ${tag}`, `B ${tag}`]);

    // The second list is as long as the store's: only the id it holds in
    // place of `c`, one the store no longer has, can refuse it.
    for (const ids of [
      [a.id, b.id, ...rest],
      [a.id, b.id, gone.id, ...rest],
    ]) {
      await expect(reorder(ids)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Give every category of the store, once each",
      });
    }
  });

  test("deleting a category with articles moves them first, and refuses without a destination", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const chains = await add(storeId, `Cadenas ${tag}`);
    const rings = await add(storeId, `Anillos ${tag}`);
    const article = await addArticle(storeId, chains.id, `Cadena ${tag}`);
    const remove = async (moveToId: number | null) =>
      await db.transaction(
        async (tx) =>
          await deleteCategory(tx, { id: chains.id, moveToId, storeId })
      );

    expect(
      onlyIds(await listStoreCategories(db, { storeId }), [chains.id])[0]
        ?.productCount
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
      onlyIds(await listStoreCategories(db, { storeId }), [
        chains.id,
        rings.id,
      ]).map((row) => row.nameEs)
    ).toEqual([`Anillos ${tag}`]);
  });

  test("a category the store no longer has is NOT_FOUND as a target or a destination", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const own = await add(storeId, `Cadenas ${tag}`);
    const gone = await add(storeId, `Viejas ${tag}`);
    await db.transaction(
      async (tx) =>
        await deleteCategory(tx, { id: gone.id, moveToId: null, storeId })
    );
    await addArticle(storeId, own.id, `Cadena ${tag}`);
    const notFound = { code: "NOT_FOUND", message: "Category not found" };

    await expect(
      db.transaction(
        async (tx) =>
          await deleteCategory(tx, { id: gone.id, moveToId: null, storeId })
      )
    ).rejects.toMatchObject(notFound);
    await expect(
      db.transaction(
        async (tx) =>
          await deleteCategory(tx, { id: own.id, moveToId: gone.id, storeId })
      )
    ).rejects.toMatchObject(notFound);
    await expect(
      db.transaction(
        async (tx) =>
          await renameCategory(tx, {
            id: gone.id,
            storeId,
            values: { nameEn: null, nameEs: `Robado ${tag}` },
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
 * Two creations in the store, the second started while the first holds the
 * store's category lock: it waits, then decides on what the first wrote.
 */
async function overlappingCreations(storeId: number, names: [string, string]) {
  const held = deferred();
  const locked = deferred();
  const first = db.transaction(async (tx) => {
    const row = await createCategory(tx, {
      storeId,
      values: { nameEn: null, nameEs: names[0] },
    });
    locked.resolve(undefined);
    await held.promise;

    return row;
  });
  // A first writer that fails never signals: its failure ends the wait.
  await Promise.race([locked.promise, first]);
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

  const results = await Promise.allSettled([first, second]);

  for (const result of results) {
    if (result.status === "fulfilled") {
      created.categoryIds.push(result.value.id);
    }
  }

  return results;
}

describe("category writes under two writers", () => {
  test("the same name created twice at once ends in one category and one CONFLICT", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();

    const [first, second] = await overlappingCreations(storeId, [
      `Collares ${tag}`,
      `collares ${tag}`,
    ]);

    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({
      reason: {
        code: "CONFLICT",
        message: "Another category of this store already has that name",
      },
      status: "rejected",
    });
    expect(
      (await listStoreCategories(db, { storeId }))
        .filter((row) => row.nameEs.toLowerCase() === `collares ${tag}`)
        .map((row) => row.nameEs)
    ).toEqual([`Collares ${tag}`]);
  });

  test("two different names created at once get their own places", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const last = await lastPosition(storeId);

    const [first, second] = await overlappingCreations(storeId, [
      `Collares ${tag}`,
      `Pulseras ${tag}`,
    ]);

    expect([first, second]).toMatchObject([
      { status: "fulfilled", value: { position: last + 1 } },
      { status: "fulfilled", value: { position: last + 2 } },
    ]);
  });
});
