import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { UpdateCategoryPageValues } from "@/lib/schemas/catalog";
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
  updateCategoryPage,
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
      discardedImageUrls: [],
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

    // On every path, before a failed wait is thrown: a second writer that
    // never waited still runs, and both may commit a category to clean up.
    for (const result of await Promise.allSettled([first, second])) {
      if (result.status === "fulfilled") {
        created.categoryIds.push(result.value.id);
      }
    }
  }

  return await Promise.allSettled([first, second]);
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
// The deployment's Blob store (FER-011): covers it uploaded live in its
// `local/cover/` folder. Nothing here reaches the real store.
const BLOB_STORE = {
  host: "integration.public.blob.vercel-storage.com",
  namespace: "local",
  token: "vercel_blob_rw_Integration_s3cretPart",
} as const;

/** An address of an upload for covers that no other call gave. */
function coverUpload() {
  return `https://${BLOB_STORE.host}/local/cover/${randomUUID()}.webp`;
}

/** A category's page with no texts, in `parentId`'s group or in none. */
function page(id: number, parentId: number | null): UpdateCategoryPageValues {
  return {
    coverAltEn: null,
    coverAltEs: null,
    id,
    parentId,
    seoDescriptionEn: null,
    seoDescriptionEs: null,
    seoTitleEn: null,
    seoTitleEs: null,
  };
}

async function setPage(
  storeId: number,
  values: ReturnType<typeof page> & Record<string, unknown>
) {
  return await db.transaction(
    async (tx) =>
      await updateCategoryPage(tx, { blobStore: BLOB_STORE, storeId, values })
  );
}

/** Each of `ids`' group, as the admin's list reads it. */
async function groupsOf(storeId: number, ids: number[]) {
  return (await listStoreCategories(db, { storeId }))
    .filter((row) => ids.includes(row.id))
    .map((row) => [row.id, row.parentId]);
}

describe("category covers (FER-011)", () => {
  /** What the category's row holds of its cover. */
  async function coverOf(id: number) {
    const [row] = await db
      .select({
        coverHeight: category.coverHeight,
        coverPhoneUrl: category.coverPhoneUrl,
        coverUrl: category.coverUrl,
        coverWidth: category.coverWidth,
      })
      .from(category)
      .where(eq(category.id, id));

    return row;
  }

  test("an uploaded cover is stored with its size; replacing it answers the old file, keeping the phone one", async () => {
    const storeId = await theStoreId(db);
    const rings = await add(storeId, `Anillos ${uniqueTag()}`);
    const [first, phone, second] = [
      coverUpload(),
      coverUpload(),
      coverUpload(),
    ];

    await expect(
      setPage(storeId, {
        ...page(rings.id, null),
        cover: { height: 800, url: first, width: 2400 },
        coverPhone: { height: 1200, url: phone, width: 1200 },
      })
    ).resolves.toEqual({
      discardedImageUrls: [],
      id: rings.id,
      parentId: null,
    });
    await expect(
      setPage(storeId, {
        ...page(rings.id, null),
        cover: { height: 900, url: second, width: 1800 },
      })
    ).resolves.toEqual({
      discardedImageUrls: [first],
      id: rings.id,
      parentId: null,
    });

    await expect(coverOf(rings.id)).resolves.toEqual({
      coverHeight: 900,
      coverPhoneUrl: phone,
      coverUrl: second,
      coverWidth: 1800,
    });
  });

  test("an address that is not this store's upload is refused and nothing changes", async () => {
    const storeId = await theStoreId(db);
    const rings = await add(storeId, `Anillos ${uniqueTag()}`);

    await expect(
      setPage(storeId, {
        ...page(rings.id, null),
        cover: {
          height: 800,
          url: "https://images.example.com/cover.webp",
          width: 2400,
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A cover image must be one uploaded to this store",
    });
    await expect(coverOf(rings.id)).resolves.toEqual({
      coverHeight: null,
      coverPhoneUrl: null,
      coverUrl: null,
      coverWidth: null,
    });
  });

  test("deleting a category answers its cover's files", async () => {
    const storeId = await theStoreId(db);
    const rings = await add(storeId, `Anillos ${uniqueTag()}`);
    const [computer, phone] = [coverUpload(), coverUpload()];
    await setPage(storeId, {
      ...page(rings.id, null),
      cover: { height: 800, url: computer, width: 2400 },
      coverPhone: { height: 1200, url: phone, width: 1200 },
    });

    await expect(
      db.transaction(
        async (tx) =>
          await deleteCategory(tx, { id: rings.id, moveToId: null, storeId })
      )
    ).resolves.toEqual({
      discardedImageUrls: [computer, phone],
      id: rings.id,
      movedArticles: 0,
    });
  });
});

describe("category groups and pages (FER-043)", () => {
  test("a category joins a group and leaves it; a group joins none and a category in a group holds none", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const group = await add(storeId, `Bijouterie ${tag}`);
    const rings = await add(storeId, `Anillos ${tag}`);
    const chains = await add(storeId, `Cadenas ${tag}`);

    await setPage(storeId, page(rings.id, group.id));
    expect(await groupsOf(storeId, [group.id, rings.id])).toEqual([
      [group.id, null],
      [rings.id, group.id],
    ]);

    await expect(
      setPage(storeId, page(group.id, chains.id))
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A group cannot join another group",
    });
    await expect(
      setPage(storeId, page(chains.id, rings.id))
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A category in a group cannot be a group",
    });

    await setPage(storeId, page(rings.id, null));
    expect(await groupsOf(storeId, [rings.id])).toEqual([[rings.id, null]]);
  });

  test("the database refuses a category as its own group, and a group of another store's", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const rings = await add(storeId, `Anillos ${tag}`);

    await expect(
      db
        .update(category)
        .set({ parentId: rings.id })
        .where(eq(category.id, rings.id))
    ).rejects.toMatchObject({
      cause: { constraint: "category_parent_not_self" },
    });
    await expect(
      db
        .update(category)
        .set({ parentId: 2_000_000_000 })
        .where(eq(category.id, rings.id))
    ).rejects.toMatchObject({
      cause: { constraint: "category_store_parent_fk" },
    });
  });

  test("page texts are kept by a rename, and English ones need an English name", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const rings = await add(storeId, `Anillos ${tag}`, `Rings ${tag}`);

    await setPage(storeId, {
      ...page(rings.id, null),
      coverAltEn: "A ring",
      seoTitleEn: "Rings at the fair",
      seoTitleEs: "Anillos de la feria",
    });
    await db.transaction(
      async (tx) =>
        await renameCategory(tx, {
          id: rings.id,
          storeId,
          values: { nameEn: `Rings! ${tag}`, nameEs: `Anillos! ${tag}` },
        })
    );

    expect(
      (await listStoreCategories(db, { storeId })).find(
        (row) => row.id === rings.id
      )
    ).toMatchObject({
      coverAltEn: "A ring",
      nameEn: `Rings! ${tag}`,
      nameEs: `Anillos! ${tag}`,
      seoTitleEn: "Rings at the fair",
      seoTitleEs: "Anillos de la feria",
    });

    // Without its English name, its English texts go with the row.
    await db.transaction(
      async (tx) =>
        await renameCategory(tx, {
          id: rings.id,
          storeId,
          values: { nameEn: null, nameEs: `Anillos! ${tag}` },
        })
    );
    expect(
      (await listStoreCategories(db, { storeId })).find(
        (row) => row.id === rings.id
      )
    ).toMatchObject({ coverAltEn: null, nameEn: null, seoTitleEn: null });
    await expect(
      setPage(storeId, { ...page(rings.id, null), seoTitleEn: "Rings" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Name the category in English before its English page texts",
    });
  });

  test("deleting a group leaves its categories, in no group", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const group = await add(storeId, `Bijouterie ${tag}`);
    const rings = await add(storeId, `Anillos ${tag}`);
    await setPage(storeId, page(rings.id, group.id));

    await db.transaction(
      async (tx) =>
        await deleteCategory(tx, { id: group.id, moveToId: null, storeId })
    );

    expect(await groupsOf(storeId, [group.id, rings.id])).toEqual([
      [rings.id, null],
    ]);
  });
});

/**
 * Two page writes in the store, the second started while the first holds
 * the store's category lock: it waits, then decides on what the first wrote.
 */
async function overlappingPages(
  storeId: number,
  values: [ReturnType<typeof page>, ReturnType<typeof page>]
) {
  const held = deferred();
  const locked = deferred();
  const first = db.transaction(async (tx) => {
    const result = await updateCategoryPage(tx, {
      blobStore: null,
      storeId,
      values: values[0],
    });
    locked.resolve(undefined);
    await held.promise;

    return result;
  });
  await Promise.race([locked.promise, first]);
  const second = setPage(storeId, values[1]);

  try {
    await waitUntilBlocked();
  } finally {
    held.resolve(undefined);
  }

  return await Promise.allSettled([first, second]);
}

describe("category groups under two writers", () => {
  test("two categories put into each other at once end in one group and one refusal, never a loop", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const a = await add(storeId, `Uno ${tag}`);
    const b = await add(storeId, `Dos ${tag}`);

    const [first, second] = await overlappingPages(storeId, [
      page(a.id, b.id),
      page(b.id, a.id),
    ]);

    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({
      reason: {
        code: "BAD_REQUEST",
        message: "A category in a group cannot be a group",
      },
      status: "rejected",
    });
    expect(await groupsOf(storeId, [a.id, b.id])).toEqual([
      [a.id, b.id],
      [b.id, null],
    ]);
  });

  test("control: two categories put into one group at once both join it", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const group = await add(storeId, `Grupo ${tag}`);
    const a = await add(storeId, `Uno ${tag}`);
    const b = await add(storeId, `Dos ${tag}`);

    const results = await overlappingPages(storeId, [
      page(a.id, group.id),
      page(b.id, group.id),
    ]);

    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    expect(await groupsOf(storeId, [a.id, b.id])).toEqual([
      [a.id, group.id],
      [b.id, group.id],
    ]);
  });
});
