import { describe, expect, test } from "vitest";

import type { UpdateCategoryPageValues } from "@/lib/schemas/catalog";
import { category, categoryTranslation, product } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderOrderBy, renderQuery } from "@/server/test/render-sql";
import { makeStoreCategory } from "@/test/factories/store-category";

import {
  createCategory,
  deleteCategory,
  listStoreCategories,
  renameCategory,
  reorderCategories,
  updateCategoryPage,
} from "./category";

const STORE_ID = 3;

// The deployment's Blob store (FER-011) and cover uploads in its folder.
const BLOB_STORE = {
  host: "store9.public.blob.vercel-storage.com",
  namespace: "qa",
  token: "vercel_blob_rw_Store9_s3cretPart",
} as const;
const UPLOAD_ID = "0f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e";
const coverUpload = (id: string) =>
  `https://${BLOB_STORE.host}/qa/cover/${id}.webp`;
const OLD_COMPUTER = coverUpload("11111111-1111-4111-8111-111111111111");
const OLD_PHONE = coverUpload("22222222-2222-4222-8222-222222222222");
const NEW_COMPUTER = coverUpload(UPLOAD_ID);

const LOCK = {
  params: [`category:${STORE_ID}`],
  sql: "select pg_advisory_xact_lock(hashtext($1))",
};

const FIND_SQL = '("category"."id" = $1 and "category"."storeId" = $2)';
const STORE_SQL = '"category"."storeId" = $1';
const HELD_SQL = '("product"."storeId" = $1 and "product"."categoryId" = $2)';

const NAME_FREE_SQL =
  '("category"."storeId" = $1 and "category_translation"."locale" = $2 and ' +
  'lower(unaccent("category_translation"."name")) = lower(unaccent($3)))';

const DUPLICATE = {
  code: "CONFLICT",
  message: "Another category of this store already has that name",
};

function makeRow(
  overrides: Partial<{ id: number; position: number; slug: string }> = {}
) {
  return { id: 1, position: 0, slug: "collares", ...overrides };
}

function makeNames(
  overrides: Partial<{ nameEn: string | null; nameEs: string }> = {}
) {
  return { nameEn: "Necklaces", nameEs: "Collares", ...overrides };
}

/**
 * The mock database answering the store's queries by the SQL they send, so
 * an answer reaches only the query it is for:
 * - `own`: the store's categories, found (and row-locked) by id in the store;
 * - `existing`: what the store's category list (`slug`, `position`) holds;
 * - `held`: how many articles the category being deleted has (`null`: the
 *   count returned no row);
 * - `taken`: whether the duplicate-name check finds another category.
 */
function setup({
  cover = { coverPhoneUrl: null, coverUrl: null },
  existing = [],
  held = 0,
  own = [],
  taken = false,
}: {
  /** The cover every category found by id holds (FER-011). */
  cover?: { coverPhoneUrl: string | null; coverUrl: string | null };
  existing?: ReturnType<typeof makeRow>[];
  held?: number | null;
  own?: number[];
  taken?: boolean;
} = {}) {
  const db = createMockDatabase();
  db.$["select.where"].mockImplementation(async (where: unknown) => {
    const { params, sql } = renderQuery(where);

    if (sql === STORE_SQL && params[0] === STORE_ID) {
      return await Promise.resolve(existing);
    }

    if (sql === HELD_SQL && params[0] === STORE_ID) {
      return await Promise.resolve(held === null ? [] : [{ total: held }]);
    }

    return await Promise.resolve([]);
  });
  // A lookup by id ends in `.for(lock)`: it answers by the `where` it locks.
  db.$["select.for"].mockImplementation(async () => {
    const { params, sql } = renderQuery(
      db.$["select.where"].mock.calls.at(-1)?.[0]
    );
    const [id, storeId] = params;

    return await Promise.resolve(
      sql === FIND_SQL && storeId === STORE_ID && own.includes(id as number)
        ? [{ ...cover, id, slug: `categoria-${String(id)}` }]
        : []
    );
  });
  db.$["select.limit"].mockResolvedValue(taken ? [{ id: 99 }] : []);

  /** Every `where` the plain selects sent, as SQL and parameters. */
  const selectWheres = () =>
    db.$["select.where"].mock.calls.map(([where]) => renderQuery(where));
  /** The row locks the lookups took, in order. */
  const locks = () => db.$["select.for"].mock.calls.map(([lock]) => lock);

  return { db, locks, selectWheres };
}

describe("listStoreCategories", () => {
  test("names each category by locale, counts its articles, with its group, page texts and cover, in the store's order", async () => {
    const { db, selectWheres } = setup();
    const noCover = {
      coverHeight: null,
      coverPhoneHeight: null,
      coverPhoneUrl: null,
      coverPhoneWidth: null,
      coverUrl: null,
      coverWidth: null,
    };
    db.$["select.orderBy"].mockResolvedValue([
      {
        ...noCover,
        coverHeight: 800,
        coverPhoneHeight: 1200,
        coverPhoneUrl: "/seed/ring-1.jpg",
        coverPhoneWidth: 1000,
        coverUrl: "/seed/ring-2.jpg",
        coverWidth: 1200,
        id: 4,
        parentId: null,
        position: 0,
        productCount: 3,
        showInHeader: true,
        slug: "collares",
      },
      {
        ...noCover,
        id: 2,
        parentId: 4,
        position: 1,
        productCount: 0,
        showInHeader: true,
        slug: "aros",
      },
      {
        ...noCover,
        id: 9,
        parentId: null,
        position: 2,
        productCount: 0,
        showInHeader: false,
        slug: "sin-nombre",
      },
    ]);
    const text = (overrides: Record<string, unknown>) => ({
      coverAlt: null,
      seoDescription: null,
      seoTitle: null,
      ...overrides,
    });
    db.$["select.where"].mockImplementation(async (where: unknown) =>
      renderQuery(where).sql.startsWith('"category_translation"')
        ? await Promise.resolve([
            text({
              categoryId: 4,
              coverAlt: "Rings",
              locale: "en",
              name: "Necklaces",
              seoTitle: "Necklaces at the fair",
            }),
            text({ categoryId: 2, locale: "es", name: "Aros" }),
            text({
              categoryId: 4,
              coverAlt: "Anillos",
              locale: "es",
              name: "Collares",
              seoDescription: "Collares de la feria",
            }),
            // Another category's names never land on these rows.
            text({ categoryId: 7, locale: "es", name: "Ajena" }),
          ])
        : await Promise.resolve([])
    );

    await expect(
      listStoreCategories(db as never, { storeId: STORE_ID })
    ).resolves.toEqual([
      makeStoreCategory({
        cover: {
          computer: { height: 800, url: "/seed/ring-2.jpg", width: 1200 },
          phone: { height: 1200, url: "/seed/ring-1.jpg", width: 1000 },
        },
        coverAltEn: "Rings",
        coverAltEs: "Anillos",
        id: 4,
        nameEn: "Necklaces",
        nameEs: "Collares",
        position: 0,
        productCount: 3,
        seoDescriptionEs: "Collares de la feria",
        seoTitleEn: "Necklaces at the fair",
        slug: "collares",
      }),
      makeStoreCategory({
        id: 2,
        nameEs: "Aros",
        parentId: 4,
        position: 1,
        slug: "aros",
      }),
      makeStoreCategory({
        id: 9,
        nameEs: "",
        position: 2,
        showInHeader: false,
        slug: "sin-nombre",
      }),
    ]);

    const [columns] = db.$.select.mock.calls[0] ?? [];
    const { productCount, ...plain } = columns as Record<string, unknown>;
    expect(plain).toEqual({
      coverHeight: category.coverHeight,
      coverPhoneHeight: category.coverPhoneHeight,
      coverPhoneUrl: category.coverPhoneUrl,
      coverPhoneWidth: category.coverPhoneWidth,
      coverUrl: category.coverUrl,
      coverWidth: category.coverWidth,
      id: category.id,
      parentId: category.parentId,
      position: category.position,
      showInHeader: category.showInHeader,
      slug: category.slug,
    });
    // Drafts count too: every article joined to the category, in one
    // statement; a category with none counts 0, not 1.
    expect(renderQuery(productCount)).toEqual({
      params: [],
      sql: 'count("product"."id")',
    });
    expect(db.$["select.leftJoin"].mock.calls[0]?.[0]).toBe(product);
    expect(renderQuery(db.$["select.leftJoin"].mock.calls[0]?.[1])).toEqual({
      params: [],
      sql: '"product"."categoryId" = "category"."id"',
    });
    expect(db.$["select.groupBy"]).toHaveBeenCalledExactlyOnceWith(category.id);
    expect(db.$["select.from"].mock.calls).toEqual([
      [category],
      [categoryTranslation],
    ]);
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"category"."position" asc, "category"."id" asc'
    );
    expect(db.$.select.mock.calls[1]).toEqual([
      {
        categoryId: categoryTranslation.categoryId,
        coverAlt: categoryTranslation.coverAlt,
        locale: categoryTranslation.locale,
        name: categoryTranslation.name,
        seoDescription: categoryTranslation.seoDescription,
        seoTitle: categoryTranslation.seoTitle,
      },
    ]);
    expect(selectWheres()).toEqual([
      { params: [STORE_ID], sql: STORE_SQL },
      {
        params: [4, 2, 9],
        sql: '"category_translation"."categoryId" in ($1, $2, $3)',
      },
    ]);
  });

  test("reads no names for a store without categories", async () => {
    const { db, selectWheres } = setup();

    await expect(
      listStoreCategories(db as never, { storeId: STORE_ID })
    ).resolves.toEqual([]);
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(category);
    expect(selectWheres()).toEqual([{ params: [STORE_ID], sql: STORE_SQL }]);
  });
});

describe("createCategory", () => {
  async function create(
    db: ReturnType<typeof setup>["db"],
    values = makeNames()
  ) {
    return await createCategory(db as never, { storeId: STORE_ID, values });
  }

  test("refuses a Spanish name the store already has, under the lock and before any insert", async () => {
    const { db, selectWheres } = setup({ taken: true });

    await expect(create(db)).rejects.toMatchObject(DUPLICATE);

    expect(
      db.$.execute.mock.calls.map(([query]) => renderQuery(query))
    ).toEqual([LOCK]);
    // Case and accents do not make another name; the new one has no id yet.
    expect(selectWheres()).toEqual([
      { params: [STORE_ID, "es", "Collares"], sql: NAME_FREE_SQL },
    ]);
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(
      categoryTranslation
    );
    expect(renderQuery(db.$["select.innerJoin"].mock.calls[0]?.[1])).toEqual({
      params: [],
      sql: '"category"."id" = "category_translation"."categoryId"',
    });
    expect(db.$["select.innerJoin"].mock.calls[0]?.[0]).toBe(category);
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(1);
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("inserts at the end, its slug past the taken ones, then both names", async () => {
    const { db, selectWheres } = setup({
      existing: [
        makeRow({ id: 1, position: 0, slug: "collares" }),
        makeRow({ id: 2, position: 4, slug: "collares-2" }),
      ],
    });
    const created = { id: 7, position: 5, slug: "collares-3" };
    db.$["insert.returning"].mockResolvedValue([created]);

    await expect(create(db)).resolves.toBe(created);

    expect(renderQuery(db.$.execute.mock.calls[0]?.[0])).toEqual(LOCK);
    expect(selectWheres()).toEqual([
      { params: [STORE_ID, "es", "Collares"], sql: NAME_FREE_SQL },
      { params: [STORE_ID], sql: STORE_SQL },
    ]);
    expect(db.$.insert.mock.calls).toEqual([[category], [categoryTranslation]]);
    expect(db.$["insert.values"].mock.calls).toEqual([
      [{ position: 5, slug: "collares-3", storeId: STORE_ID }],
      [
        [
          { categoryId: 7, locale: "es", name: "Collares" },
          { categoryId: 7, locale: "en", name: "Necklaces" },
        ],
      ],
    ]);
    expect(db.$["insert.returning"]).toHaveBeenCalledExactlyOnceWith({
      id: category.id,
      position: category.position,
      slug: category.slug,
    });
    // The lock is taken before the duplicate check reads anything.
    expect(db.$.execute.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      db.$["select.where"].mock.invocationCallOrder[0] ?? 0
    );
  });

  test.each([
    ["Cart", "cart-2"],
    ["Productos", "productos-2"],
    ["EN", "en-2"],
    ["Admin", "admin-2"],
    ["Cartera", "cartera"],
  ])(
    "gives %s the slug %s: never an address the site already answers",
    async (nameEs, slug) => {
      const { db } = setup();
      db.$["insert.returning"].mockResolvedValue([
        { id: 7, position: 0, slug },
      ]);

      await create(db, makeNames({ nameEs }));

      expect(db.$["insert.values"].mock.calls[0]).toEqual([
        { position: 0, slug, storeId: STORE_ID },
      ]);
    }
  );

  test("puts the store's first category at position 0, with only its Spanish name", async () => {
    const { db } = setup();
    db.$["insert.returning"].mockResolvedValue([
      { id: 1, position: 0, slug: "aros-de-plata" },
    ]);

    await create(db, makeNames({ nameEn: null, nameEs: "Aros de Plata" }));

    expect(db.$["insert.values"].mock.calls).toEqual([
      [{ position: 0, slug: "aros-de-plata", storeId: STORE_ID }],
      [[{ categoryId: 1, locale: "es", name: "Aros de Plata" }]],
    ]);
  });

  test("names an unreadable Spanish name by the fallback slug", async () => {
    const { db } = setup({ existing: [makeRow({ slug: "categoria" })] });
    db.$["insert.returning"].mockResolvedValue([
      { id: 2, position: 1, slug: "categoria-2" },
    ]);

    await create(db, makeNames({ nameEs: "¡¡¡" }));

    expect(db.$["insert.values"].mock.calls[0]).toEqual([
      { position: 1, slug: "categoria-2", storeId: STORE_ID },
    ]);
  });

  test("fails loudly when the insert returns no row, writing no names", async () => {
    const { db } = setup();

    await expect(create(db)).rejects.toThrow(
      "Inserting a category returned no row"
    );
    expect(db.$.insert.mock.calls).toEqual([[category]]);
  });
});

describe("renameCategory", () => {
  async function rename(
    db: ReturnType<typeof setup>["db"],
    { id = 5, values = makeNames() } = {}
  ) {
    return await renameCategory(db as never, { id, storeId: STORE_ID, values });
  }

  test("refuses a category of another store, before checking the name", async () => {
    const { db, selectWheres } = setup({ own: [6] });

    await expect(rename(db)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Category not found",
    });
    expect(renderQuery(db.$.execute.mock.calls[0]?.[0])).toEqual(LOCK);
    expect(selectWheres()).toEqual([{ params: [5, STORE_ID], sql: FIND_SQL }]);
    expect(db.$["select.limit"]).not.toHaveBeenCalled();
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("refuses a name another category has, the category itself excluded", async () => {
    const { db, selectWheres } = setup({ own: [5], taken: true });

    await expect(rename(db)).rejects.toMatchObject(DUPLICATE);
    expect(selectWheres()[1]).toEqual({
      params: [STORE_ID, "es", "Collares", 5],
      sql: `${NAME_FREE_SQL.slice(0, -1)} and "category"."id" <> $4)`,
    });
    expect(db.$.delete).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("writes both names over the ones it has, keeping its page texts, and returns the category with its slug", async () => {
    const { db, locks } = setup({ own: [5] });

    await expect(rename(db)).resolves.toEqual({
      id: 5,
      slug: "categoria-5",
    });

    // The category's row is held until the names are replaced.
    expect(locks()).toEqual(["update"]);
    // The store's lock comes first, before the category is read.
    expect(db.$.execute.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      db.$["select.where"].mock.invocationCallOrder[0] ?? 0
    );

    // Upserted, not deleted and inserted: a row's page texts (FER-043)
    // would go with it.
    expect(db.$.delete).not.toHaveBeenCalled();
    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(categoryTranslation);
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
      { categoryId: 5, locale: "es", name: "Collares" },
      { categoryId: 5, locale: "en", name: "Necklaces" },
    ]);
    const [conflict] = db.$["insert.onConflictDoUpdate"].mock.calls[0] ?? [];
    const { set, target } = conflict as {
      set: Record<string, unknown>;
      target: unknown[];
    };
    expect(target).toEqual([
      categoryTranslation.categoryId,
      categoryTranslation.locale,
    ]);
    expect(Object.keys(set)).toEqual(["name", "updatedAt"]);
    expect(renderQuery(set.name)).toEqual({
      params: [],
      sql: 'excluded."name"',
    });
  });

  test("drops the English row, its page texts with it, when the English name is cleared", async () => {
    const { db } = setup({ own: [5] });

    await rename(db, { values: makeNames({ nameEn: null }) });

    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(categoryTranslation);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [5, "en"],
      sql: '("category_translation"."categoryId" = $1 and "category_translation"."locale" = $2)',
    });
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
      { categoryId: 5, locale: "es", name: "Collares" },
    ]);
  });
});

describe("updateCategoryPage", () => {
  const CHILD_SQL =
    '("category"."storeId" = $1 and "category"."parentId" = $2)';
  const ENGLISH_SQL =
    '("category_translation"."categoryId" = $1 and "category_translation"."locale" = $2)';

  function makePage(overrides: Partial<UpdateCategoryPageValues> = {}) {
    return {
      coverAltEn: null,
      coverAltEs: null,
      id: 5,
      parentId: null,
      seoDescriptionEn: null,
      seoDescriptionEs: null,
      seoTitleEn: null,
      seoTitleEs: null,
      ...overrides,
    };
  }

  /**
   * The store's categories by id, each with its group (`null`: in none);
   * `english`: whether the category has an English row; `holds`: whether it
   * is a group already, holding a category.
   */
  function setupPage({
    blobStore = BLOB_STORE,
    english = true,
    holds = false,
    own = { 5: null, 6: null },
    stored = { coverPhoneUrl: null, coverUrl: null },
  }: {
    /** `null`: the deployment has no Blob store. */
    blobStore?: typeof BLOB_STORE | null;
    english?: boolean;
    holds?: boolean;
    own?: Record<number, number | null>;
    /** The cover category 5 holds. */
    stored?: { coverPhoneUrl: string | null; coverUrl: string | null };
  } = {}) {
    const { db } = setup();
    db.$["select.where"].mockImplementation(async (where: unknown) => {
      const { params, sql } = renderQuery(where);

      if (sql === ENGLISH_SQL && params[1] === "en") {
        return await Promise.resolve(english ? [{ id: 40 }] : []);
      }

      return await Promise.resolve([]);
    });
    db.$["select.for"].mockImplementation(async () => {
      const { params, sql } = renderQuery(
        db.$["select.where"].mock.calls.at(-1)?.[0]
      );
      const id = params[0] as number;

      return await Promise.resolve(
        sql === FIND_SQL && params[1] === STORE_ID && id in own
          ? [
              {
                ...(id === 5 ? stored : {}),
                id,
                parentId: own[id] ?? null,
                slug: `categoria-${id}`,
              },
            ]
          : []
      );
    });
    db.$["select.limit"].mockImplementation(async () => {
      const { params, sql } = renderQuery(
        db.$["select.where"].mock.calls.at(-1)?.[0]
      );

      return await Promise.resolve(
        sql === CHILD_SQL && params[1] === 5 && holds ? [{ id: 9 }] : []
      );
    });

    return {
      db,
      update: async (values = makePage()) =>
        await updateCategoryPage(db as never, {
          blobStore,
          storeId: STORE_ID,
          values,
        }),
    };
  }

  test("sets a new uploaded cover and answers the replaced files, both images", async () => {
    const { db, update } = setupPage({
      stored: { coverPhoneUrl: OLD_PHONE, coverUrl: OLD_COMPUTER },
    });

    await expect(
      update(
        makePage({
          cover: { height: 800, url: NEW_COMPUTER, width: 2400 },
          coverPhone: null,
        })
      )
    ).resolves.toEqual({
      discardedImageUrls: [OLD_COMPUTER, OLD_PHONE],
      id: 5,
      parentId: null,
    });
    expect(db.$["update.set"].mock.calls[0]).toEqual([
      {
        coverHeight: 800,
        coverPhoneHeight: null,
        coverPhoneUrl: null,
        coverPhoneWidth: null,
        coverUrl: NEW_COMPUTER,
        coverWidth: 2400,
        parentId: null,
      },
    ]);
  });

  test("leaves the cover and the header choice alone when the form sends none of them, discarding nothing", async () => {
    const { db, update } = setupPage({
      stored: { coverPhoneUrl: OLD_PHONE, coverUrl: OLD_COMPUTER },
    });

    await expect(update()).resolves.toEqual({
      discardedImageUrls: [],
      id: 5,
      parentId: null,
    });
    expect(db.$["update.set"].mock.calls[0]).toEqual([{ parentId: null }]);
  });

  test.each([true, false])(
    "writes the header choice when the form sends it (%s), beside the group",
    async (showInHeader) => {
      const { db, update } = setupPage();

      await update(makePage({ showInHeader }));

      expect(db.$["update.set"].mock.calls[0]).toEqual([
        { parentId: null, showInHeader },
      ]);
      expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
        params: [5, STORE_ID],
        sql: FIND_SQL,
      });
    }
  );

  test("keeps the stored image sent back as it is, even one from before uploads", async () => {
    const { update } = setupPage({
      blobStore: null,
      stored: { coverPhoneUrl: null, coverUrl: "/seed/cover.jpg" },
    });

    await expect(
      update(
        makePage({
          cover: { height: 600, url: "/seed/cover.jpg", width: 1800 },
        })
      )
    ).resolves.toEqual({ discardedImageUrls: [], id: 5, parentId: null });
  });

  test("removing the computer image while a phone one stays is refused", async () => {
    const { db, update } = setupPage({
      stored: { coverPhoneUrl: OLD_PHONE, coverUrl: OLD_COMPUTER },
    });

    await expect(update(makePage({ cover: null }))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A phone cover needs a computer cover",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test.each([
    ["another site's image", "https://evil.example.com/cover.webp"],
    [
      "another deployment's upload",
      `https://${BLOB_STORE.host}/production/cover/${UPLOAD_ID}.webp`,
    ],
    [
      "an upload for another purpose's folder",
      `https://${BLOB_STORE.host}/qa/avatar/${UPLOAD_ID}.webp`,
    ],
  ])("refuses %s as a cover before writing anything", async (_case, url) => {
    const { db, update } = setupPage();

    await expect(
      update(makePage({ coverPhone: { height: 1, url, width: 1 } }))
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A cover image must be one uploaded to this store",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("refuses any new image where the deployment has no Blob store", async () => {
    const { update } = setupPage({ blobStore: null });

    await expect(
      update(makePage({ cover: { height: 1, url: NEW_COMPUTER, width: 1 } }))
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A cover image must be one uploaded to this store",
    });
  });

  test("puts the category in a group and writes each language's texts to its own row, under the lock", async () => {
    const { db, update } = setupPage();

    await expect(
      update(
        makePage({
          coverAltEn: "Rings",
          parentId: 6,
          seoDescriptionEs: "Anillos de la feria",
          seoTitleEn: "Rings at the fair",
          seoTitleEs: "Anillos dorados",
        })
      )
    ).resolves.toEqual({ discardedImageUrls: [], id: 5, parentId: 6 });

    expect(renderQuery(db.$.execute.mock.calls[0]?.[0])).toEqual(LOCK);
    // The category to write, then its group to keep while it joins.
    expect(db.$["select.for"].mock.calls).toEqual([["update"], ["share"]]);
    expect(db.$.update.mock.calls).toEqual([
      [category],
      [categoryTranslation],
      [categoryTranslation],
    ]);
    expect(db.$["update.set"].mock.calls).toEqual([
      [{ parentId: 6 }],
      [
        {
          coverAlt: null,
          seoDescription: "Anillos de la feria",
          seoTitle: "Anillos dorados",
        },
      ],
      [
        {
          coverAlt: "Rings",
          seoDescription: null,
          seoTitle: "Rings at the fair",
        },
      ],
    ]);
    expect(
      db.$["update.where"].mock.calls.map(([where]) => renderQuery(where))
    ).toEqual([
      { params: [5, STORE_ID], sql: FIND_SQL },
      { params: [5, "es"], sql: ENGLISH_SQL },
      { params: [5, "en"], sql: ENGLISH_SQL },
    ]);
  });

  test("takes a category out of its group without reading any group", async () => {
    const { db, update } = setupPage({ own: { 5: 6, 6: null } });

    await expect(update(makePage({ parentId: null }))).resolves.toEqual({
      discardedImageUrls: [],
      id: 5,
      parentId: null,
    });
    expect(db.$["select.for"].mock.calls).toEqual([["update"]]);
    expect(db.$["update.set"].mock.calls[0]).toEqual([{ parentId: null }]);
  });

  test.each([
    [
      "itself",
      { parentId: 5 },
      {},
      { code: "BAD_REQUEST", message: "A category cannot be its own group" },
    ],
    [
      "a category of another store",
      { parentId: 8 },
      {},
      { code: "NOT_FOUND", message: "Group not found" },
    ],
    [
      "a category that is in a group",
      { parentId: 6 },
      { own: { 5: null, 6: 7 } },
      {
        code: "BAD_REQUEST",
        message: "A category in a group cannot be a group",
      },
    ],
    [
      "any group while it holds a category",
      { parentId: 6 },
      { holds: true },
      { code: "BAD_REQUEST", message: "A group cannot join another group" },
    ],
  ])(
    "refuses to put the category in %s, writing nothing",
    async (_case, page, options, error) => {
      const { db, update } = setupPage(options);

      await expect(update(makePage(page))).rejects.toMatchObject(error);
      expect(db.$.update).not.toHaveBeenCalled();
    }
  );

  test("refuses a category of another store before reading any group", async () => {
    const { db, update } = setupPage({ own: { 6: null } });

    await expect(update(makePage({ parentId: 6 }))).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Category not found",
    });
    expect(db.$["select.for"].mock.calls).toEqual([["update"]]);
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test.each([
    ["title", { seoTitleEn: "Rings" }],
    ["description", { seoDescriptionEn: "Rings at the fair" }],
    ["cover's alt text", { coverAltEn: "A ring" }],
  ])(
    "refuses an English %s for a category with no English name",
    async (_case, page) => {
      const { db, update } = setupPage({ english: false });

      await expect(update(makePage(page))).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Name the category in English before its English page texts",
      });
      expect(db.$.update).not.toHaveBeenCalled();
    }
  );

  test("takes Spanish texts alone for a category with no English name", async () => {
    const { db, update } = setupPage({ english: false });

    await update(makePage({ seoTitleEs: "Anillos dorados" }));

    expect(db.$["update.set"].mock.calls[1]).toEqual([
      { coverAlt: null, seoDescription: null, seoTitle: "Anillos dorados" },
    ]);
  });
});

describe("reorderCategories", () => {
  const ROWS = [makeRow({ id: 1 }), makeRow({ id: 2 }), makeRow({ id: 3 })];

  test.each([
    ["one missing", [3, 1]],
    ["one twice", [3, 1, 1]],
    ["one twice in place of another", [3, 3, 1]],
    ["another store's", [3, 1, 2, 8]],
    ["another store's in place of one", [3, 1, 8]],
    ["none", []],
  ])("refuses a list with %s, updating nothing", async (_case, ids) => {
    const { db } = setup({ existing: ROWS });

    await expect(
      reorderCategories(db as never, { ids, storeId: STORE_ID })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Give every category of the store, once each",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("gives every category its new place in one UPDATE, under the lock", async () => {
    const { db, selectWheres } = setup({ existing: ROWS });

    await expect(
      reorderCategories(db as never, { ids: [3, 1, 2], storeId: STORE_ID })
    ).resolves.toEqual({ ids: [3, 1, 2] });

    expect(renderQuery(db.$.execute.mock.calls[0]?.[0])).toEqual(LOCK);
    expect(selectWheres()).toEqual([{ params: [STORE_ID], sql: STORE_SQL }]);
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(category);
    const [set] = db.$["update.set"].mock.calls[0] ?? [];
    expect(renderQuery((set as { position: unknown }).position)).toEqual({
      params: [3, 0, 1, 1, 2, 2],
      sql: 'case "category"."id" when $1 then $2::int when $3 then $4::int when $5 then $6::int end',
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, 3, 1, 2],
      sql: '("category"."storeId" = $1 and "category"."id" in ($2, $3, $4))',
    });
  });
});

describe("deleteCategory", () => {
  async function remove(
    db: ReturnType<typeof setup>["db"],
    { id = 5, moveToId = null as number | null } = {}
  ) {
    return await deleteCategory(db as never, {
      id,
      moveToId,
      storeId: STORE_ID,
    });
  }

  function deletedWhere(db: ReturnType<typeof setup>["db"]) {
    return renderQuery(db.$["delete.where"].mock.calls[0]?.[0]);
  }

  const DELETED = {
    params: [5, STORE_ID],
    sql: FIND_SQL,
  };

  /** The deleted category's own categories left in no group (FER-043). */
  function expectDetached(db: ReturnType<typeof setup>["db"]) {
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(category);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      parentId: null,
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, 5],
      sql: '("category"."storeId" = $1 and "category"."parentId" = $2)',
    });
    expect(db.$["update.where"].mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      db.$["delete.where"].mock.invocationCallOrder[0] ?? 0
    );
  }

  test("refuses a category of another store before counting its articles", async () => {
    const { db, selectWheres } = setup({ own: [6] });

    await expect(remove(db)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Category not found",
    });
    expect(renderQuery(db.$.execute.mock.calls[0]?.[0])).toEqual(LOCK);
    expect(selectWheres()).toEqual([{ params: [5, STORE_ID], sql: FIND_SQL }]);
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test.each([null, 6, 5])(
    "deletes a category with no articles, ignoring a destination of %j",
    async (moveToId) => {
      const { db, locks, selectWheres } = setup({ own: [5] });

      await expect(remove(db, { moveToId })).resolves.toEqual({
        discardedImageUrls: [],
        id: 5,
        movedArticles: 0,
      });

      expect(locks()).toEqual(["update"]);
      expect(db.$.execute.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
        db.$["select.where"].mock.invocationCallOrder[0] ?? 0
      );

      expect(selectWheres()).toEqual([
        { params: [5, STORE_ID], sql: FIND_SQL },
        { params: [STORE_ID, 5], sql: HELD_SQL },
      ]);
      expectDetached(db);
      expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(category);
      expect(deletedWhere(db)).toEqual(DELETED);
    }
  );

  test.each([
    ["both images", OLD_PHONE, [OLD_COMPUTER, OLD_PHONE]],
    ["a computer image only", null, [OLD_COMPUTER]],
  ])(
    "answers the cover's addresses with %s, for their files to go after it",
    async (_case, coverPhoneUrl, discarded) => {
      const { db } = setup({
        cover: { coverPhoneUrl, coverUrl: OLD_COMPUTER },
        own: [5],
      });

      await expect(remove(db)).resolves.toEqual({
        discardedImageUrls: discarded,
        id: 5,
        movedArticles: 0,
      });
    }
  );

  test("reads a count with no row as no articles", async () => {
    const { db } = setup({ held: null, own: [5] });

    await expect(remove(db)).resolves.toEqual({
      discardedImageUrls: [],
      id: 5,
      movedArticles: 0,
    });
    expect(deletedWhere(db)).toEqual(DELETED);
  });

  test.each([
    [null, "Choose where its articles move before deleting it"],
    [5, "Choose another category for its articles"],
  ])(
    "refuses a category with articles and a destination of %j",
    async (moveToId, message) => {
      const { db } = setup({ held: 1, own: [5] });

      await expect(remove(db, { moveToId })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message,
      });
      // Only the group's categories were let go, in the transaction the
      // refusal rolls back: no article moved.
      expect(db.$.update.mock.calls).toEqual([[category]]);
      expect(db.$.delete).not.toHaveBeenCalled();
    }
  );

  test("refuses a destination of another store, moving nothing", async () => {
    const { db, selectWheres } = setup({ held: 2, own: [5] });

    await expect(remove(db, { moveToId: 8 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Category not found",
    });
    expect(selectWheres()[2]).toEqual({ params: [8, STORE_ID], sql: FIND_SQL });
    expect(db.$.update.mock.calls).toEqual([[category]]);
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("moves the articles to the destination, then deletes the category", async () => {
    // Counted 4, but 3 moved: the answer is what the UPDATE moved.
    const { db, locks } = setup({ held: 4, own: [5, 6] });
    db.$["update.returning"].mockResolvedValue([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);

    await expect(remove(db, { moveToId: 6 })).resolves.toEqual({
      discardedImageUrls: [],
      id: 5,
      movedArticles: 3,
    });

    // The deleted category is locked to write, its destination to keep,
    // then its articles to move, in id order (the order an order takes).
    expect(locks()).toEqual(["update", "share", "update"]);
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls.at(-1))).toBe(
      '"product"."id" asc'
    );
    expect(db.$["select.for"].mock.invocationCallOrder[2] ?? 0).toBeLessThan(
      db.$["update.where"].mock.invocationCallOrder[1] ?? 0
    );
    expect(db.$["update.returning"]).toHaveBeenCalledExactlyOnceWith({
      id: product.id,
    });
    expect(db.$.update.mock.calls).toEqual([[category], [product]]);
    expect(db.$["update.set"].mock.calls).toEqual([
      [{ parentId: null }],
      [{ categoryId: 6 }],
    ]);
    expect(renderQuery(db.$["update.where"].mock.calls[1]?.[0])).toEqual({
      params: [STORE_ID, 5],
      sql: HELD_SQL,
    });
    expect(deletedWhere(db)).toEqual(DELETED);
    expect(db.$["update.where"].mock.invocationCallOrder[1] ?? 0).toBeLessThan(
      db.$["delete.where"].mock.invocationCallOrder[0] ?? 0
    );
  });
});
