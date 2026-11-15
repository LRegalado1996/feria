import { describe, expect, test } from "vitest";

import { category, categoryTranslation, product } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderOrderBy, renderQuery } from "@/server/test/render-sql";

import {
  createCategory,
  deleteCategory,
  listStoreCategories,
  renameCategory,
  reorderCategories,
} from "./category";

const STORE_ID = 3;

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
 * - `own`: the store's categories, found by id within the store;
 * - `existing`: what the store's category list (`slug`, `position`) holds;
 * - `held`: how many articles the category being deleted has;
 * - `taken`: whether the duplicate-name check finds another category.
 */
function setup({
  existing = [],
  held = 0,
  own = [],
  taken = false,
}: {
  existing?: ReturnType<typeof makeRow>[];
  held?: number;
  own?: number[];
  taken?: boolean;
} = {}) {
  const db = createMockDatabase();
  db.$["select.where"].mockImplementation(async (where: unknown) => {
    const { params, sql } = renderQuery(where);

    if (sql === FIND_SQL) {
      const [id, storeId] = params;
      return await Promise.resolve(
        storeId === STORE_ID && own.includes(id as number)
          ? [{ id, slug: `categoria-${String(id)}` }]
          : []
      );
    }

    if (sql === STORE_SQL && params[0] === STORE_ID) {
      return await Promise.resolve(existing);
    }

    if (sql === HELD_SQL && params[0] === STORE_ID) {
      return await Promise.resolve([{ total: held }]);
    }

    return await Promise.resolve([]);
  });
  db.$["select.limit"].mockResolvedValue(taken ? [{ id: 99 }] : []);

  /** Every `where` the plain selects sent, as SQL and parameters. */
  const selectWheres = () =>
    db.$["select.where"].mock.calls.map(([where]) => renderQuery(where));

  return { db, selectWheres };
}

describe("listStoreCategories", () => {
  test("names each category by locale, counts its articles, in the store's order", async () => {
    const { db, selectWheres } = setup();
    db.query.category.findMany.mockResolvedValue([
      {
        id: 4,
        position: 0,
        slug: "collares",
        translations: [
          { locale: "en", name: "Necklaces" },
          { locale: "es", name: "Collares" },
        ],
      },
      {
        id: 2,
        position: 1,
        slug: "aros",
        translations: [{ locale: "es", name: "Aros" }],
      },
      { id: 9, position: 2, slug: "sin-nombre", translations: [] },
    ]);
    db.$["select.groupBy"].mockResolvedValue([
      { categoryId: 4, total: 3 },
      { categoryId: null, total: 5 },
    ]);

    await expect(
      listStoreCategories(db as never, { storeId: STORE_ID })
    ).resolves.toEqual([
      {
        id: 4,
        nameEn: "Necklaces",
        nameEs: "Collares",
        position: 0,
        productCount: 3,
        slug: "collares",
      },
      {
        id: 2,
        nameEn: null,
        nameEs: "Aros",
        position: 1,
        productCount: 0,
        slug: "aros",
      },
      {
        id: 9,
        nameEn: null,
        nameEs: "",
        position: 2,
        productCount: 0,
        slug: "sin-nombre",
      },
    ]);

    const [config] = db.query.category.findMany.mock.calls[0] ?? [];
    const read = config as {
      columns: unknown;
      orderBy: unknown;
      where: unknown;
      with: unknown;
    };
    expect(renderQuery(read.where)).toEqual({
      params: [STORE_ID],
      sql: STORE_SQL,
    });
    expect(renderOrderBy(read.orderBy)).toBe(
      '"category"."position" asc, "category"."id" asc'
    );
    expect(read.columns).toEqual({ id: true, position: true, slug: true });
    expect(read.with).toEqual({
      translations: { columns: { locale: true, name: true } },
    });

    // Drafts count too: the article count is filtered by the store only.
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(product);
    expect(selectWheres()).toEqual([
      { params: [STORE_ID], sql: '"product"."storeId" = $1' },
    ]);
    expect(db.$["select.groupBy"]).toHaveBeenCalledExactlyOnceWith(
      product.categoryId
    );
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

  test("replaces both names and returns the category with its slug", async () => {
    const { db } = setup({ own: [5] });

    await expect(rename(db)).resolves.toEqual({
      id: 5,
      slug: "categoria-5",
    });

    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(categoryTranslation);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [5],
      sql: '"category_translation"."categoryId" = $1',
    });
    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(categoryTranslation);
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
      { categoryId: 5, locale: "es", name: "Collares" },
      { categoryId: 5, locale: "en", name: "Necklaces" },
    ]);
    expect(db.$["delete.where"].mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      db.$["insert.values"].mock.invocationCallOrder[0] ?? 0
    );
  });

  test("drops the English name when it is cleared", async () => {
    const { db } = setup({ own: [5] });

    await rename(db, { values: makeNames({ nameEn: null }) });

    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
      { categoryId: 5, locale: "es", name: "Collares" },
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
      const { db, selectWheres } = setup({ own: [5] });

      await expect(remove(db, { moveToId })).resolves.toEqual({
        id: 5,
        movedArticles: 0,
      });

      expect(selectWheres()).toEqual([
        { params: [5, STORE_ID], sql: FIND_SQL },
        { params: [STORE_ID, 5], sql: HELD_SQL },
      ]);
      expect(db.$.update).not.toHaveBeenCalled();
      expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(category);
      expect(deletedWhere(db)).toEqual(DELETED);
    }
  );

  test("reads a count with no row as no articles", async () => {
    const { db } = setup({ own: [5] });
    db.$["select.where"].mockImplementation(async (where: unknown) =>
      renderQuery(where).sql === FIND_SQL
        ? await Promise.resolve([{ id: 5, slug: "collares" }])
        : await Promise.resolve([])
    );

    await expect(remove(db)).resolves.toEqual({ id: 5, movedArticles: 0 });
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
      expect(db.$.update).not.toHaveBeenCalled();
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
    expect(db.$.update).not.toHaveBeenCalled();
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("moves the articles to the destination, then deletes the category", async () => {
    const { db } = setup({ held: 3, own: [5, 6] });

    await expect(remove(db, { moveToId: 6 })).resolves.toEqual({
      id: 5,
      movedArticles: 3,
    });

    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(product);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      categoryId: 6,
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, 5],
      sql: HELD_SQL,
    });
    expect(deletedWhere(db)).toEqual(DELETED);
    expect(db.$["update.where"].mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      db.$["delete.where"].mock.invocationCallOrder[0] ?? 0
    );
  });
});
