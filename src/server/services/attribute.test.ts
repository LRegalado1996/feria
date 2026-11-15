import { describe, expect, test } from "vitest";

import {
  attribute,
  attributeTranslation,
  attributeValue,
  attributeValueTranslation,
  product,
  productAttributeValue,
} from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderOrderBy, renderQuery } from "@/server/test/render-sql";

import {
  createAttribute,
  createAttributeValue,
  deleteAttribute,
  deleteAttributeValue,
  listCatalogFilters,
  listStoreAttributes,
  renameAttribute,
  reorderAttributes,
  reorderAttributeValues,
  resolveCatalogFilters,
  setProductAttributeValues,
  updateAttributeValue,
} from "./attribute";

const STORE_ID = 3;

const LOCK = {
  params: [`attribute:${String(STORE_ID)}`],
  sql: "select pg_advisory_xact_lock(hashtext($1))",
};

const STORE_SQL = '"attribute"."storeId" = $1';
const FIND_SQL = '("attribute"."id" = $1 and "attribute"."storeId" = $2)';
const FIND_VALUE_SQL =
  '("attribute_value"."id" = $1 and "attribute"."storeId" = $2)';
const VALUES_OF_SQL = '"attribute_value"."attributeId" = $1';
const ARTICLE_SQL = '("product"."id" = $1 and "product"."storeId" = $2)';
const OWN_VALUES_PREFIX =
  '("attribute"."storeId" = $1 and "attribute_value"."id" in (';

const NAME_FREE_SQL =
  '("attribute"."storeId" = $1 and "attribute_translation"."locale" = $2 and ' +
  'lower(unaccent("attribute_translation"."name")) = lower(unaccent($3)))';
const VALUE_NAME_FREE_SQL =
  '("attribute_value"."attributeId" = $1 and "attribute_value_translation"."locale" = $2 and ' +
  'lower(unaccent("attribute_value_translation"."name")) = lower(unaccent($3)))';

const NAME_TAKEN = {
  code: "CONFLICT",
  message: "That name is already in use here",
};
const FILTER_NOT_FOUND = { code: "NOT_FOUND", message: "Filter not found" };
const VALUE_NOT_FOUND = {
  code: "NOT_FOUND",
  message: "Filter value not found",
};

function makeNames(
  overrides: Partial<{ nameEn: string | null; nameEs: string }> = {}
) {
  return { nameEn: "Color", nameEs: "Color", ...overrides };
}

function makeValueNames(
  overrides: Partial<{ nameEn: string | null; nameEs: string }> = {}
) {
  return { nameEn: "Gold", nameEs: "Dorado", ...overrides };
}

/**
 * The mock database answering the store's queries by the SQL they send, so
 * an answer reaches only the query it is for:
 * - `own`: the store's filter ids, found (and row-locked) by id in the store;
 * - `ownValues`: the store's value ids, each with its filter's id;
 * - `articles`: the store's article ids;
 * - `existing`: what the store's filter list (`slug`, `position`, `id`) holds;
 * - `existingValues`: what the values of one of `own` hold;
 * - `taken`: whether the duplicate-name check finds another row.
 */
function setup({
  articles = [],
  existing = [],
  existingValues = [],
  own = [],
  ownValues = {},
  taken = false,
}: {
  articles?: number[];
  existing?: { id?: number; position?: number; slug?: string }[];
  existingValues?: { id?: number; position?: number; slug?: string }[];
  own?: number[];
  ownValues?: Record<number, number>;
  taken?: boolean;
} = {}) {
  const db = createMockDatabase();
  db.$["select.where"].mockImplementation(async (where: unknown) => {
    const { params, sql } = renderQuery(where);

    if (sql === STORE_SQL && params[0] === STORE_ID) {
      return await Promise.resolve(existing);
    }

    if (sql === VALUES_OF_SQL && own.includes(params[0] as number)) {
      return await Promise.resolve(existingValues);
    }

    return await Promise.resolve([]);
  });
  // A lookup that locks rows ends in `.for(lock)`: it answers by the `where`
  // it locks.
  db.$["select.for"].mockImplementation(async () => {
    const { params, sql } = renderQuery(
      db.$["select.where"].mock.calls.at(-1)?.[0]
    );
    const [id, storeId] = params as number[];

    if (sql === FIND_SQL && storeId === STORE_ID && own.includes(id ?? 0)) {
      return await Promise.resolve([{ id, slug: `filtro-${String(id)}` }]);
    }

    const attributeId = ownValues[id ?? 0];

    if (
      sql === FIND_VALUE_SQL &&
      storeId === STORE_ID &&
      attributeId !== undefined
    ) {
      return await Promise.resolve([{ attributeId, id }]);
    }

    if (
      sql === ARTICLE_SQL &&
      storeId === STORE_ID &&
      articles.includes(id ?? 0)
    ) {
      return await Promise.resolve([{ id }]);
    }

    if (sql.startsWith(OWN_VALUES_PREFIX) && params[0] === STORE_ID) {
      return await Promise.resolve(
        (params.slice(1) as number[])
          .filter((valueId) => ownValues[valueId] !== undefined)
          .map((valueId) => ({ id: valueId }))
      );
    }

    return await Promise.resolve([]);
  });
  db.$["select.limit"].mockResolvedValue(taken ? [{ id: 99 }] : []);

  /** Every `where` the plain selects sent, as SQL and parameters. */
  const selectWheres = () =>
    db.$["select.where"].mock.calls.map(([where]) => renderQuery(where));
  /** The row locks the lookups took, in order. */
  const locks = () => db.$["select.for"].mock.calls;
  /** The advisory locks taken, as SQL and parameters. */
  const advisoryLocks = () =>
    db.$.execute.mock.calls.map(([query]) => renderQuery(query));
  /** Whether the store's lock came before anything was read. */
  const lockedFirst = () =>
    (db.$.execute.mock.invocationCallOrder[0] ?? Infinity) <
    (db.$["select.where"].mock.invocationCallOrder[0] ?? 0);

  return { advisoryLocks, db, lockedFirst, locks, selectWheres };
}

type MockDb = ReturnType<typeof setup>["db"];

/** Answers a listing's `orderBy` by the `where` that preceded it. */
function answerOrderBy(db: MockDb, answers: Record<string, unknown[]>) {
  db.$["select.orderBy"].mockImplementation(async () => {
    const { sql } = renderQuery(db.$["select.where"].mock.calls.at(-1)?.[0]);

    return await Promise.resolve(
      Object.entries(answers).find(([prefix]) => sql.startsWith(prefix))?.[1] ??
        []
    );
  });
}

/** Answers the name reads by the translation table their `where` filters. */
function answerNames(
  db: MockDb,
  {
    attributeNames,
    valueNames,
  }: { attributeNames: unknown[]; valueNames: unknown[] }
) {
  db.$["select.where"].mockImplementation(async (where: unknown) => {
    const { sql } = renderQuery(where);

    if (sql.startsWith('"attribute_translation"')) {
      return await Promise.resolve(attributeNames);
    }

    if (sql.startsWith('"attribute_value_translation"')) {
      return await Promise.resolve(valueNames);
    }

    return await Promise.resolve([]);
  });
}

describe("listStoreAttributes", () => {
  test("names each filter and value by locale, counts the value's articles, in order", async () => {
    const { db, selectWheres } = setup();
    answerOrderBy(db, {
      [STORE_SQL]: [
        { id: 4, position: 0, slug: "color" },
        { id: 2, position: 1, slug: "talle" },
      ],
      '"attribute_value"."attributeId" in': [
        {
          attributeId: 4,
          id: 41,
          position: 0,
          productCount: 3,
          slug: "dorado",
          swatchColor: "#d4af37",
        },
        {
          attributeId: 2,
          id: 21,
          position: 0,
          productCount: 0,
          slug: "m",
          swatchColor: null,
        },
        {
          attributeId: 4,
          id: 40,
          position: 1,
          productCount: 0,
          slug: "plateado",
          swatchColor: "#c0c0c0",
        },
      ],
    });
    answerNames(db, {
      attributeNames: [
        { locale: "en", name: "Colour", ownerId: 4 },
        { locale: "es", name: "Color", ownerId: 4 },
        { locale: "es", name: "Talle", ownerId: 2 },
        // Another filter's names never land on these rows.
        { locale: "en", name: "Size", ownerId: 7 },
      ],
      valueNames: [
        { locale: "es", name: "Dorado", ownerId: 41 },
        { locale: "en", name: "Gold", ownerId: 41 },
        { locale: "en", name: "Medium", ownerId: 21 },
      ],
    });

    await expect(
      listStoreAttributes(db as never, { storeId: STORE_ID })
    ).resolves.toEqual([
      {
        id: 4,
        nameEn: "Colour",
        nameEs: "Color",
        position: 0,
        slug: "color",
        values: [
          {
            id: 41,
            nameEn: "Gold",
            nameEs: "Dorado",
            position: 0,
            productCount: 3,
            slug: "dorado",
            swatchColor: "#d4af37",
          },
          {
            id: 40,
            nameEn: null,
            nameEs: "",
            position: 1,
            productCount: 0,
            slug: "plateado",
            swatchColor: "#c0c0c0",
          },
        ],
      },
      {
        id: 2,
        nameEn: null,
        nameEs: "Talle",
        position: 1,
        slug: "talle",
        values: [
          {
            id: 21,
            nameEn: "Medium",
            nameEs: "",
            position: 0,
            productCount: 0,
            slug: "m",
            swatchColor: null,
          },
        ],
      },
    ]);

    expect(db.$["select.from"].mock.calls).toEqual([
      [attribute],
      [attributeValue],
      [attributeTranslation],
      [attributeValueTranslation],
    ]);
    // Drafts count too: every link to the value, in one statement; a value
    // without one counts 0, not 1.
    const [, valueColumns] = db.$.select.mock.calls.map(([columns]) => columns);
    expect(
      renderQuery((valueColumns as { productCount: unknown }).productCount)
    ).toEqual({ params: [], sql: 'count("product_attribute_value"."id")' });
    expect(db.$["select.leftJoin"].mock.calls[0]?.[0]).toBe(
      productAttributeValue
    );
    expect(renderQuery(db.$["select.leftJoin"].mock.calls[0]?.[1])).toEqual({
      params: [],
      sql: '"product_attribute_value"."attributeValueId" = "attribute_value"."id"',
    });
    expect(db.$["select.groupBy"]).toHaveBeenCalledExactlyOnceWith(
      attributeValue.id
    );
    expect(
      db.$["select.orderBy"].mock.calls.map((terms) => renderOrderBy(terms))
    ).toEqual([
      '"attribute"."position" asc, "attribute"."id" asc',
      '"attribute_value"."position" asc, "attribute_value"."id" asc',
    ]);
    expect(selectWheres()).toEqual([
      { params: [STORE_ID], sql: STORE_SQL },
      { params: [4, 2], sql: '"attribute_value"."attributeId" in ($1, $2)' },
      {
        params: [4, 2],
        sql: '"attribute_translation"."attributeId" in ($1, $2)',
      },
      {
        params: [41, 21, 40],
        sql: '"attribute_value_translation"."attributeValueId" in ($1, $2, $3)',
      },
    ]);
  });

  test("reads nothing more for a store without filters", async () => {
    const { db, selectWheres } = setup();

    await expect(
      listStoreAttributes(db as never, { storeId: STORE_ID })
    ).resolves.toEqual([]);
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(attribute);
    expect(selectWheres()).toEqual([{ params: [STORE_ID], sql: STORE_SQL }]);
  });

  test("reads no value names when no filter has values, a missing Spanish name as empty", async () => {
    const { db } = setup();
    answerOrderBy(db, { [STORE_SQL]: [{ id: 4, position: 0, slug: "color" }] });
    answerNames(db, {
      attributeNames: [{ locale: "en", name: "Colour", ownerId: 4 }],
      valueNames: [],
    });

    await expect(
      listStoreAttributes(db as never, { storeId: STORE_ID })
    ).resolves.toEqual([
      {
        id: 4,
        nameEn: "Colour",
        nameEs: "",
        position: 0,
        slug: "color",
        values: [],
      },
    ]);
    expect(db.$["select.from"].mock.calls).toEqual([
      [attribute],
      [attributeValue],
      [attributeTranslation],
    ]);
  });
});

describe("createAttribute", () => {
  async function create(db: MockDb, values = makeNames()) {
    return await createAttribute(db as never, { storeId: STORE_ID, values });
  }

  test("refuses a Spanish name the store already has, under the lock and before any insert", async () => {
    const { advisoryLocks, db, lockedFirst, selectWheres } = setup({
      taken: true,
    });

    await expect(create(db)).rejects.toMatchObject(NAME_TAKEN);

    expect(advisoryLocks()).toEqual([LOCK]);
    expect(lockedFirst()).toBe(true);
    // Case and accents do not make another name; the new one has no id yet.
    expect(selectWheres()).toEqual([
      { params: [STORE_ID, "es", "Color"], sql: NAME_FREE_SQL },
    ]);
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(
      attributeTranslation
    );
    expect(db.$["select.innerJoin"].mock.calls[0]?.[0]).toBe(attribute);
    expect(renderQuery(db.$["select.innerJoin"].mock.calls[0]?.[1])).toEqual({
      params: [],
      sql: '"attribute"."id" = "attribute_translation"."attributeId"',
    });
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(1);
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("inserts at the end, its slug past the taken ones, then both names", async () => {
    const { db, selectWheres } = setup({
      existing: [
        { position: 0, slug: "color" },
        { position: 4, slug: "color-2" },
      ],
    });
    const created = { id: 7, position: 5, slug: "color-3" };
    db.$["insert.returning"].mockResolvedValue([created]);

    await expect(create(db)).resolves.toBe(created);

    expect(selectWheres()).toEqual([
      { params: [STORE_ID, "es", "Color"], sql: NAME_FREE_SQL },
      { params: [STORE_ID], sql: STORE_SQL },
    ]);
    expect(db.$.insert.mock.calls).toEqual([
      [attribute],
      [attributeTranslation],
    ]);
    expect(db.$["insert.values"].mock.calls).toEqual([
      [{ position: 5, slug: "color-3", storeId: STORE_ID }],
      [
        [
          { attributeId: 7, locale: "es", name: "Color" },
          { attributeId: 7, locale: "en", name: "Color" },
        ],
      ],
    ]);
    expect(db.$["insert.returning"]).toHaveBeenCalledExactlyOnceWith({
      id: attribute.id,
      position: attribute.position,
      slug: attribute.slug,
    });
  });

  test.each([
    ["Category", "category-2"],
    ["Cursor", "cursor-2"],
    ["Q", "q-2"],
    ["Sort", "sort-2"],
    ["Categoría", "categoria"],
  ])(
    "gives %j the slug %j: the catalog's own parameters are never a filter's",
    async (nameEs, slug) => {
      const { db } = setup();
      db.$["insert.returning"].mockResolvedValue([
        { id: 1, position: 0, slug },
      ]);

      await create(db, makeNames({ nameEn: null, nameEs }));

      expect(db.$["insert.values"].mock.calls).toEqual([
        [{ position: 0, slug, storeId: STORE_ID }],
        [[{ attributeId: 1, locale: "es", name: nameEs }]],
      ]);
    }
  );

  test("names an unreadable Spanish name by the fallback slug", async () => {
    const { db } = setup({ existing: [{ position: 0, slug: "filtro" }] });
    db.$["insert.returning"].mockResolvedValue([
      { id: 2, position: 1, slug: "filtro-2" },
    ]);

    await create(db, makeNames({ nameEs: "¡¡¡" }));

    expect(db.$["insert.values"].mock.calls[0]).toEqual([
      { position: 1, slug: "filtro-2", storeId: STORE_ID },
    ]);
  });

  test("fails loudly when the insert returns no row, writing no names", async () => {
    const { db } = setup();

    await expect(create(db)).rejects.toThrow(
      "Inserting a filter returned no row"
    );
    expect(db.$.insert.mock.calls).toEqual([[attribute]]);
  });
});

describe("renameAttribute", () => {
  async function rename(db: MockDb, { id = 5, values = makeNames() } = {}) {
    return await renameAttribute(db as never, {
      id,
      storeId: STORE_ID,
      values,
    });
  }

  test("refuses a filter of another store, before checking the name", async () => {
    const { advisoryLocks, db, selectWheres } = setup({ own: [6] });

    await expect(rename(db)).rejects.toMatchObject(FILTER_NOT_FOUND);
    expect(advisoryLocks()).toEqual([LOCK]);
    expect(selectWheres()).toEqual([{ params: [5, STORE_ID], sql: FIND_SQL }]);
    expect(db.$["select.limit"]).not.toHaveBeenCalled();
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("refuses a name another filter has, the filter itself excluded", async () => {
    const { db, selectWheres } = setup({ own: [5], taken: true });

    await expect(rename(db)).rejects.toMatchObject(NAME_TAKEN);
    expect(selectWheres()[1]).toEqual({
      params: [STORE_ID, "es", "Color", 5],
      sql: `${NAME_FREE_SQL.slice(0, -1)} and "attribute"."id" <> $4)`,
    });
    expect(db.$.delete).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("replaces both names under the row's lock and returns the filter with its slug", async () => {
    const { db, lockedFirst, locks } = setup({ own: [5] });

    await expect(rename(db)).resolves.toEqual({ id: 5, slug: "filtro-5" });

    expect(locks()).toEqual([["update"]]);
    expect(lockedFirst()).toBe(true);
    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(attributeTranslation);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [5],
      sql: '"attribute_translation"."attributeId" = $1',
    });
    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(attributeTranslation);
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
      { attributeId: 5, locale: "es", name: "Color" },
      { attributeId: 5, locale: "en", name: "Color" },
    ]);
    expect(db.$["delete.where"].mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      db.$["insert.values"].mock.invocationCallOrder[0] ?? 0
    );
    // A rename never touches the slug, the catalog's URL parameter.
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("drops the English name when it is cleared", async () => {
    const { db } = setup({ own: [5] });

    await rename(db, { values: makeNames({ nameEn: null }) });

    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
      { attributeId: 5, locale: "es", name: "Color" },
    ]);
  });
});

describe("reorderAttributes", () => {
  const ROWS = [{ id: 1 }, { id: 2 }, { id: 3 }];

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
      reorderAttributes(db as never, { ids, storeId: STORE_ID })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Give every filter of the store, once each",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("gives every filter its new place in one UPDATE, under the lock", async () => {
    const { advisoryLocks, db, selectWheres } = setup({ existing: ROWS });

    await expect(
      reorderAttributes(db as never, { ids: [3, 1, 2], storeId: STORE_ID })
    ).resolves.toEqual({ ids: [3, 1, 2] });

    expect(advisoryLocks()).toEqual([LOCK]);
    expect(selectWheres()).toEqual([{ params: [STORE_ID], sql: STORE_SQL }]);
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(attribute);
    const [set] = db.$["update.set"].mock.calls[0] ?? [];
    expect(renderQuery((set as { position: unknown }).position)).toEqual({
      params: [3, 0, 1, 1, 2, 2],
      sql: 'case "attribute"."id" when $1 then $2::int when $3 then $4::int when $5 then $6::int end',
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, 3, 1, 2],
      sql: '("attribute"."storeId" = $1 and "attribute"."id" in ($2, $3, $4))',
    });
  });
});

describe("deleteAttribute", () => {
  test("refuses a filter of another store, deleting nothing", async () => {
    const { advisoryLocks, db, selectWheres } = setup({ own: [6] });

    await expect(
      deleteAttribute(db as never, { id: 5, storeId: STORE_ID })
    ).rejects.toMatchObject(FILTER_NOT_FOUND);
    expect(advisoryLocks()).toEqual([LOCK]);
    expect(selectWheres()).toEqual([{ params: [5, STORE_ID], sql: FIND_SQL }]);
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("deletes the store's filter by id and store, under its row lock", async () => {
    const { db, lockedFirst, locks } = setup({ own: [5] });

    await expect(
      deleteAttribute(db as never, { id: 5, storeId: STORE_ID })
    ).resolves.toEqual({ id: 5 });

    expect(lockedFirst()).toBe(true);
    expect(locks()).toEqual([["update"]]);
    // Its values and their links go with it (ON DELETE CASCADE).
    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(attribute);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [5, STORE_ID],
      sql: FIND_SQL,
    });
  });
});

describe("createAttributeValue", () => {
  async function create(
    db: MockDb,
    {
      attributeId = 5,
      swatchColor = "#d4af37",
      values = makeValueNames(),
    }: {
      attributeId?: number;
      swatchColor?: string | null;
      values?: ReturnType<typeof makeValueNames>;
    } = {}
  ) {
    return await createAttributeValue(db as never, {
      attributeId,
      storeId: STORE_ID,
      swatchColor,
      values,
    });
  }

  test("refuses a filter of another store, before checking the name", async () => {
    const { advisoryLocks, db, selectWheres } = setup({ own: [6] });

    await expect(create(db)).rejects.toMatchObject(FILTER_NOT_FOUND);
    expect(advisoryLocks()).toEqual([LOCK]);
    expect(selectWheres()).toEqual([{ params: [5, STORE_ID], sql: FIND_SQL }]);
    expect(db.$["select.limit"]).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("refuses a Spanish name its filter already has, before any insert", async () => {
    const { db, selectWheres } = setup({ own: [5], taken: true });

    await expect(create(db)).rejects.toMatchObject(NAME_TAKEN);
    expect(selectWheres()).toEqual([
      { params: [5, STORE_ID], sql: FIND_SQL },
      { params: [5, "es", "Dorado"], sql: VALUE_NAME_FREE_SQL },
    ]);
    expect(db.$["select.from"].mock.calls[1]).toEqual([
      attributeValueTranslation,
    ]);
    expect(db.$["select.innerJoin"].mock.calls[0]?.[0]).toBe(attributeValue);
    expect(renderQuery(db.$["select.innerJoin"].mock.calls[0]?.[1])).toEqual({
      params: [],
      sql: '"attribute_value"."id" = "attribute_value_translation"."attributeValueId"',
    });
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("inserts at the end of its filter, its slug past the taken ones, with its swatch and names", async () => {
    const { db, lockedFirst, locks, selectWheres } = setup({
      existingValues: [
        { position: 0, slug: "dorado" },
        { position: 2, slug: "dorado-2" },
      ],
      own: [5],
    });
    const created = { id: 41, position: 3, slug: "dorado-3" };
    db.$["insert.returning"].mockResolvedValue([created]);

    await expect(create(db)).resolves.toBe(created);

    expect(lockedFirst()).toBe(true);
    // The filter is held to keep while its value is added.
    expect(locks()).toEqual([["update"]]);
    expect(selectWheres()[2]).toEqual({ params: [5], sql: VALUES_OF_SQL });
    expect(db.$.insert.mock.calls).toEqual([
      [attributeValue],
      [attributeValueTranslation],
    ]);
    expect(db.$["insert.values"].mock.calls).toEqual([
      [
        {
          attributeId: 5,
          position: 3,
          slug: "dorado-3",
          swatchColor: "#d4af37",
        },
      ],
      [
        [
          { attributeValueId: 41, locale: "es", name: "Dorado" },
          { attributeValueId: 41, locale: "en", name: "Gold" },
        ],
      ],
    ]);
    expect(db.$["insert.returning"]).toHaveBeenCalledExactlyOnceWith({
      id: attributeValue.id,
      position: attributeValue.position,
      slug: attributeValue.slug,
    });
  });

  test.each([
    ["¡¡¡", "valor"],
    // Only a filter's slug is a URL parameter: a value may be `category`.
    ["Category", "category"],
  ])(
    "puts the filter's first value %j at 0 as %j, without swatch or English",
    async (nameEs, slug) => {
      const { db } = setup({ own: [5] });
      db.$["insert.returning"].mockResolvedValue([
        { id: 1, position: 0, slug },
      ]);

      await create(db, {
        swatchColor: null,
        values: makeValueNames({ nameEn: null, nameEs }),
      });

      expect(db.$["insert.values"].mock.calls).toEqual([
        [{ attributeId: 5, position: 0, slug, swatchColor: null }],
        [[{ attributeValueId: 1, locale: "es", name: nameEs }]],
      ]);
    }
  );

  test("fails loudly when the insert returns no row, writing no names", async () => {
    const { db } = setup({ own: [5] });

    await expect(create(db)).rejects.toThrow(
      "Inserting a filter value returned no row"
    );
    expect(db.$.insert.mock.calls).toEqual([[attributeValue]]);
  });
});

describe("updateAttributeValue", () => {
  async function update(
    db: MockDb,
    {
      swatchColor = "#c0c0c0",
      values = makeValueNames(),
    }: {
      swatchColor?: string | null;
      values?: ReturnType<typeof makeValueNames>;
    } = {}
  ) {
    return await updateAttributeValue(db as never, {
      id: 41,
      storeId: STORE_ID,
      swatchColor,
      values,
    });
  }

  test("refuses a value of another store's filter, writing nothing", async () => {
    const { advisoryLocks, db, selectWheres } = setup({ ownValues: { 40: 5 } });

    await expect(update(db)).rejects.toMatchObject(VALUE_NOT_FOUND);
    expect(advisoryLocks()).toEqual([LOCK]);
    expect(selectWheres()).toEqual([
      { params: [41, STORE_ID], sql: FIND_VALUE_SQL },
    ]);
    expect(db.$["select.innerJoin"].mock.calls[0]?.[0]).toBe(attribute);
    expect(renderQuery(db.$["select.innerJoin"].mock.calls[0]?.[1])).toEqual({
      params: [],
      sql: '"attribute"."id" = "attribute_value"."attributeId"',
    });
    expect(db.$["select.limit"]).not.toHaveBeenCalled();
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("refuses a name another value of its filter has, the value itself excluded", async () => {
    const { db, selectWheres } = setup({ ownValues: { 41: 5 }, taken: true });

    await expect(update(db)).rejects.toMatchObject(NAME_TAKEN);
    expect(selectWheres()[1]).toEqual({
      params: [5, "es", "Dorado", 41],
      sql: `${VALUE_NAME_FREE_SQL.slice(0, -1)} and "attribute_value"."id" <> $4)`,
    });
    expect(db.$.update).not.toHaveBeenCalled();
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("sets the swatch and replaces both names under the value's lock", async () => {
    const { db, lockedFirst, locks } = setup({ ownValues: { 41: 5 } });

    await expect(update(db)).resolves.toEqual({ id: 41 });

    expect(lockedFirst()).toBe(true);
    // Only the value's row is locked, not its filter's.
    expect(locks()).toEqual([["update", { of: attributeValue }]]);
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(attributeValue);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      swatchColor: "#c0c0c0",
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [41],
      sql: '"attribute_value"."id" = $1',
    });
    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(
      attributeValueTranslation
    );
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [41],
      sql: '"attribute_value_translation"."attributeValueId" = $1',
    });
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
      { attributeValueId: 41, locale: "es", name: "Dorado" },
      { attributeValueId: 41, locale: "en", name: "Gold" },
    ]);
  });

  test("clears the swatch and the English name", async () => {
    const { db } = setup({ ownValues: { 41: 5 } });

    await update(db, {
      swatchColor: null,
      values: makeValueNames({ nameEn: null }),
    });

    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      swatchColor: null,
    });
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
      { attributeValueId: 41, locale: "es", name: "Dorado" },
    ]);
  });
});

describe("reorderAttributeValues", () => {
  const ROWS = [{ id: 21 }, { id: 22 }, { id: 23 }];

  async function reorder(db: MockDb, ids: number[]) {
    return await reorderAttributeValues(db as never, {
      attributeId: 5,
      ids,
      storeId: STORE_ID,
    });
  }

  test("refuses a filter of another store, before reading its values", async () => {
    const { db, selectWheres } = setup({ existingValues: ROWS, own: [6] });

    await expect(reorder(db, [23, 21, 22])).rejects.toMatchObject(
      FILTER_NOT_FOUND
    );
    expect(selectWheres()).toEqual([{ params: [5, STORE_ID], sql: FIND_SQL }]);
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test.each([
    ["one missing", [23, 21]],
    ["one twice", [23, 21, 21]],
    ["one twice in place of another", [23, 23, 21]],
    ["another filter's", [23, 21, 22, 31]],
    ["another filter's in place of one", [23, 21, 31]],
    ["none", []],
  ])("refuses a list with %s, updating nothing", async (_case, ids) => {
    const { db } = setup({ existingValues: ROWS, own: [5] });

    await expect(reorder(db, ids)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Give every value of the filter, once each",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("gives every value its new place in one UPDATE, under the lock", async () => {
    const { advisoryLocks, db, selectWheres } = setup({
      existingValues: ROWS,
      own: [5],
    });

    await expect(reorder(db, [23, 21, 22])).resolves.toEqual({
      ids: [23, 21, 22],
    });

    expect(advisoryLocks()).toEqual([LOCK]);
    expect(selectWheres()).toEqual([
      { params: [5, STORE_ID], sql: FIND_SQL },
      { params: [5], sql: VALUES_OF_SQL },
    ]);
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(attributeValue);
    const [set] = db.$["update.set"].mock.calls[0] ?? [];
    expect(renderQuery((set as { position: unknown }).position)).toEqual({
      params: [23, 0, 21, 1, 22, 2],
      sql: 'case "attribute_value"."id" when $1 then $2::int when $3 then $4::int when $5 then $6::int end',
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [5, 23, 21, 22],
      sql: '("attribute_value"."attributeId" = $1 and "attribute_value"."id" in ($2, $3, $4))',
    });
  });
});

describe("deleteAttributeValue", () => {
  test("refuses a value of another store's filter, deleting nothing", async () => {
    const { advisoryLocks, db, selectWheres } = setup({ ownValues: { 40: 5 } });

    await expect(
      deleteAttributeValue(db as never, { id: 41, storeId: STORE_ID })
    ).rejects.toMatchObject(VALUE_NOT_FOUND);
    expect(advisoryLocks()).toEqual([LOCK]);
    expect(selectWheres()).toEqual([
      { params: [41, STORE_ID], sql: FIND_VALUE_SQL },
    ]);
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test.each([
    ["three articles", [{ id: 1 }, { id: 2 }, { id: 3 }], 3],
    ["none", [], 0],
  ])(
    "takes the value off its articles, then deletes it, answering %s",
    async (_case, links, removedFromArticles) => {
      const { db, lockedFirst, locks } = setup({ ownValues: { 41: 5 } });
      db.$["delete.returning"].mockResolvedValue(links);

      await expect(
        deleteAttributeValue(db as never, { id: 41, storeId: STORE_ID })
      ).resolves.toEqual({ id: 41, removedFromArticles });

      expect(lockedFirst()).toBe(true);
      expect(locks()).toEqual([["update", { of: attributeValue }]]);
      expect(db.$.delete.mock.calls).toEqual([
        [productAttributeValue],
        [attributeValue],
      ]);
      expect(
        db.$["delete.where"].mock.calls.map(([where]) => renderQuery(where))
      ).toEqual([
        {
          params: [41],
          sql: '"product_attribute_value"."attributeValueId" = $1',
        },
        { params: [41], sql: '"attribute_value"."id" = $1' },
      ]);
      expect(db.$["delete.returning"]).toHaveBeenCalledExactlyOnceWith({
        id: productAttributeValue.id,
      });
    }
  );
});

describe("setProductAttributeValues", () => {
  async function set(
    db: MockDb,
    {
      productId = 9,
      valueIds = [21, 22],
    }: { productId?: number; valueIds?: number[] } = {}
  ) {
    return await setProductAttributeValues(db as never, {
      productId,
      storeId: STORE_ID,
      valueIds,
    });
  }

  test("refuses an article of another store, writing nothing", async () => {
    const { db, selectWheres } = setup({
      articles: [8],
      ownValues: { 21: 5, 22: 5 },
    });

    await expect(set(db)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Article not found",
    });
    expect(selectWheres()).toEqual([
      { params: [9, STORE_ID], sql: ARTICLE_SQL },
    ]);
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(product);
    expect(db.$.delete).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("refuses a value of another store's filter, never attaching it", async () => {
    const { db, selectWheres } = setup({ articles: [9], ownValues: { 21: 5 } });

    await expect(set(db, { valueIds: [21, 99] })).rejects.toMatchObject(
      VALUE_NOT_FOUND
    );
    expect(selectWheres()[1]).toEqual({
      params: [STORE_ID, 21, 99],
      sql: `${OWN_VALUES_PREFIX}$2, $3))`,
    });
    expect(db.$.delete).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("replaces what the article carried with the store's values", async () => {
    const { db, locks } = setup({ articles: [9], ownValues: { 21: 5, 22: 6 } });

    await expect(set(db)).resolves.toEqual({ id: 9, valueIds: [21, 22] });

    // The article is held to write, its values to keep until attached.
    expect(locks()).toEqual([["update"], ["share", { of: attributeValue }]]);
    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(productAttributeValue);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [9],
      sql: '"product_attribute_value"."productId" = $1',
    });
    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(productAttributeValue);
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
      { attributeValueId: 21, productId: 9 },
      { attributeValueId: 22, productId: 9 },
    ]);
    expect(db.$["delete.where"].mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      db.$["insert.values"].mock.invocationCallOrder[0] ?? 0
    );
  });

  test("takes every value off with an empty list, checking and inserting none", async () => {
    const { db, selectWheres } = setup({ articles: [9] });

    await expect(set(db, { valueIds: [] })).resolves.toEqual({
      id: 9,
      valueIds: [],
    });

    expect(selectWheres()).toEqual([
      { params: [9, STORE_ID], sql: ARTICLE_SQL },
    ]);
    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(productAttributeValue);
    expect(db.$.insert).not.toHaveBeenCalled();
  });
});

describe("listCatalogFilters", () => {
  function makeFilterRow(overrides: Record<string, unknown> = {}) {
    return {
      attributeId: 4,
      attributePosition: 0,
      attributeSlug: "color",
      count: 2,
      id: 41,
      position: 0,
      slug: "dorado",
      swatchColor: "#d4af37",
      ...overrides,
    };
  }

  test("offers nothing, reading no names, when no published article carries a value", async () => {
    const { db } = setup();

    await expect(
      listCatalogFilters(db as never, { locale: "es", storeId: STORE_ID })
    ).resolves.toEqual([]);
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(attributeValue);
  });

  test("groups the carried values by filter in order, named in the asked language or the one they have", async () => {
    const { db, selectWheres } = setup();
    answerOrderBy(db, {
      [STORE_SQL]: [
        makeFilterRow(),
        makeFilterRow({ count: 1, id: 40, position: 1, slug: "plateado" }),
        makeFilterRow({
          attributeId: 2,
          attributePosition: 1,
          attributeSlug: "talle",
          count: 5,
          id: 21,
          slug: "m",
          swatchColor: null,
        }),
        makeFilterRow({
          attributeId: 8,
          attributePosition: 2,
          attributeSlug: "sin-nombre",
          count: 1,
          id: 81,
          slug: "x",
          swatchColor: null,
        }),
      ],
    });
    answerNames(db, {
      attributeNames: [
        { locale: "es", name: "Color", ownerId: 4 },
        { locale: "en", name: "Colour", ownerId: 4 },
        { locale: "es", name: "Talle", ownerId: 2 },
      ],
      valueNames: [
        { locale: "es", name: "Dorado", ownerId: 41 },
        { locale: "en", name: "Gold", ownerId: 41 },
        { locale: "es", name: "Plateado", ownerId: 40 },
        { locale: "en", name: "Medium", ownerId: 21 },
      ],
    });

    await expect(
      listCatalogFilters(db as never, { locale: "en", storeId: STORE_ID })
    ).resolves.toEqual([
      {
        lang: "en",
        name: "Colour",
        slug: "color",
        values: [
          {
            count: 2,
            lang: "en",
            name: "Gold",
            slug: "dorado",
            swatchColor: "#d4af37",
          },
          {
            count: 1,
            lang: "es",
            name: "Plateado",
            slug: "plateado",
            swatchColor: "#d4af37",
          },
        ],
      },
      {
        lang: "es",
        name: "Talle",
        slug: "talle",
        values: [
          {
            count: 5,
            lang: "en",
            name: "Medium",
            slug: "m",
            swatchColor: null,
          },
        ],
      },
      // Without names, the asked language and empty text.
      {
        lang: "en",
        name: "",
        slug: "sin-nombre",
        values: [
          { count: 1, lang: "en", name: "", slug: "x", swatchColor: null },
        ],
      },
    ]);

    // Only published articles of this store count, and a value none
    // carries is not joined at all.
    const [columns] = db.$.select.mock.calls[0] ?? [];
    expect(renderQuery((columns as { count: unknown }).count)).toEqual({
      params: [],
      sql: 'count("product"."id")',
    });
    expect(
      db.$["select.innerJoin"].mock.calls.map(([table, on]) => [
        table,
        renderQuery(on),
      ])
    ).toEqual([
      [
        attribute,
        {
          params: [],
          sql: '"attribute"."id" = "attribute_value"."attributeId"',
        },
      ],
      [
        productAttributeValue,
        {
          params: [],
          sql: '"product_attribute_value"."attributeValueId" = "attribute_value"."id"',
        },
      ],
      [
        product,
        {
          params: ["published", STORE_ID],
          sql:
            '("product"."id" = "product_attribute_value"."productId" and ' +
            '"product"."status" = $1 and "product"."storeId" = $2)',
        },
      ],
    ]);
    expect(db.$["select.groupBy"]).toHaveBeenCalledExactlyOnceWith(
      attribute.id,
      attributeValue.id
    );
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"attribute"."position" asc, "attribute"."id" asc, ' +
        '"attribute_value"."position" asc, "attribute_value"."id" asc'
    );
    expect(selectWheres()).toEqual([
      { params: [STORE_ID], sql: STORE_SQL },
      {
        params: [4, 2, 8],
        sql: '"attribute_translation"."attributeId" in ($1, $2, $3)',
      },
      {
        params: [41, 40, 21, 81],
        sql: '"attribute_value_translation"."attributeValueId" in ($1, $2, $3, $4)',
      },
    ]);
  });

  test("prefers the Spanish name for a Spanish reader", async () => {
    const { db } = setup();
    answerOrderBy(db, { [STORE_SQL]: [makeFilterRow()] });
    answerNames(db, {
      attributeNames: [
        { locale: "en", name: "Colour", ownerId: 4 },
        { locale: "es", name: "Color", ownerId: 4 },
      ],
      valueNames: [
        { locale: "en", name: "Gold", ownerId: 41 },
        { locale: "es", name: "Dorado", ownerId: 41 },
      ],
    });

    await expect(
      listCatalogFilters(db as never, { locale: "es", storeId: STORE_ID })
    ).resolves.toEqual([
      {
        lang: "es",
        name: "Color",
        slug: "color",
        values: [
          {
            count: 2,
            lang: "es",
            name: "Dorado",
            slug: "dorado",
            swatchColor: "#d4af37",
          },
        ],
      },
    ]);
  });
});

describe("resolveCatalogFilters", () => {
  test("asks nothing for no filters", async () => {
    const { db } = setup();

    await expect(
      resolveCatalogFilters(db as never, { filters: [], storeId: STORE_ID })
    ).resolves.toEqual([]);
    expect(db.$.select).not.toHaveBeenCalled();
  });

  test("answers one group of the store's value ids per known filter, ignoring unknown filters and values", async () => {
    const { db, selectWheres } = setup();
    db.$["select.where"].mockResolvedValue([
      { attributeSlug: "color", id: 21, slug: "dorado" },
      { attributeSlug: "color", id: 22, slug: "plateado" },
      { attributeSlug: "color", id: 23, slug: "negro" },
      { attributeSlug: "talle", id: 31, slug: "m" },
      { attributeSlug: "material", id: 41, slug: "oro" },
    ]);

    await expect(
      resolveCatalogFilters(db as never, {
        filters: [
          // `m` is a size, not a color: it never joins this group.
          { attribute: "color", values: ["plateado", "morado", "dorado", "m"] },
          // A filter whose values the store does not have filters nothing.
          { attribute: "talle", values: ["xl"] },
          { attribute: "material", values: ["oro"] },
          { attribute: "marca", values: ["acme"] },
        ],
        storeId: STORE_ID,
      })
    ).resolves.toEqual([[21, 22], [41]]);

    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(attributeValue);
    expect(db.$["select.innerJoin"].mock.calls[0]?.[0]).toBe(attribute);
    expect(selectWheres()).toEqual([
      {
        params: [STORE_ID, "color", "talle", "material", "marca"],
        sql: '("attribute"."storeId" = $1 and "attribute"."slug" in ($2, $3, $4, $5))',
      },
    ]);
  });

  test("merges a filter named twice into one group, so its values stay alternatives", async () => {
    const { db } = setup();
    db.$["select.where"].mockResolvedValue([
      { attributeSlug: "color", id: 21, slug: "dorado" },
      { attributeSlug: "color", id: 22, slug: "violeta" },
      { attributeSlug: "material", id: 41, slug: "oro" },
    ]);

    await expect(
      resolveCatalogFilters(db as never, {
        filters: [
          { attribute: "color", values: ["dorado"] },
          { attribute: "material", values: ["oro"] },
          { attribute: "color", values: ["violeta", "dorado"] },
        ],
        storeId: STORE_ID,
      })
    ).resolves.toEqual([[21, 22], [41]]);
  });
});
