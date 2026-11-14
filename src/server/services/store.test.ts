import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import type { CreateStoreValues } from "@/lib/schemas/store";
import { store, storeTranslation } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery, renderSql } from "@/server/test/render-sql";

import {
  createStore,
  findActiveStoreBySlug,
  getActiveStoreBySlug,
  listTakenStoreSlugs,
  updateStore,
} from "./store";

const STORED_AT = new Date("2026-11-13T12:00:00.000Z");

const SPANISH = {
  description: "Anillos y cadenas.",
  locale: "es",
  tagline: "Hola",
} as const;
const ENGLISH = {
  description: "Rings and chains.",
  locale: "en",
  tagline: "Hello",
} as const;

function makeValues(
  overrides: Partial<CreateStoreValues> = {}
): CreateStoreValues {
  return {
    colorAccent: "#c8f31d",
    colorBackground: "#f2f3f0",
    colorContrast: "#111312",
    colorForeground: "#111312",
    colorSurface: "#ffffff",
    currencyCode: "UYU",
    instagramUrl: "https://instagram.com/sample",
    isActive: true,
    logoUrl: null,
    name: "Sample Store",
    slug: "sample-store",
    tiktokUrl: null,
    translations: [],
    whatsappNumber: "+59899123456",
    ...overrides,
  };
}

/** The row Postgres hands back for {@link makeValues}. */
function makeRow(overrides: Partial<CreateStoreValues> = {}) {
  const { translations: _translations, ...columns } = makeValues(overrides);

  return { ...columns, createdAt: STORED_AT, id: 7, updatedAt: STORED_AT };
}

/** What node-postgres throws for a violated constraint, as Drizzle wraps it. */
function violation(code: string, constraint: string) {
  return new DrizzleQueryError(
    "insert into store",
    [],
    Object.assign(new Error("violates constraint"), { code, constraint })
  );
}

function setup() {
  const db = createMockDatabase();

  return {
    db,
    create: async (values: CreateStoreValues) =>
      await createStore(db as never, values),
    find: async (slug: string) =>
      await findActiveStoreBySlug(db as never, slug),
    get: async (slug: string) =>
      await getActiveStoreBySlug(db as never, { slug }),
    taken: async (slugs: string[]) =>
      await listTakenStoreSlugs(db as never, slugs),
    update: async (values: CreateStoreValues & { id: number }) =>
      await updateStore(db as never, values),
    /** Answers the store's own `returning()` and its texts' by what was asked. */
    answerWrites: (
      operation: "insert" | "update",
      row: ReturnType<typeof makeRow> | undefined,
      translations: unknown[] = []
    ) => {
      db.$[`${operation}.returning`].mockImplementation(
        async (columns: unknown) =>
          await Promise.resolve(columns || !row ? [] : [row])
      );
      // A store's texts are always inserted, on a create and on an edit.
      db.$["insert.returning"].mockImplementation(async (columns: unknown) => {
        if (columns) {
          return await Promise.resolve(translations);
        }

        return await Promise.resolve(
          operation === "insert" && row ? [row] : []
        );
      });
    },
  };
}

describe("findActiveStoreBySlug", () => {
  test("looks up the slug among active stores only", async () => {
    const { db, find } = setup();

    await find("sample-store");

    const query = db.query.store.findFirst.mock.calls[0]?.[0] as {
      where: unknown;
    };
    expect(renderQuery(query.where)).toEqual({
      sql: '("store"."slug" = $1 and "store"."isActive" = $2)',
      params: ["sample-store", true],
    });
  });

  test("reads what a public page shows, with the texts, and nothing internal", async () => {
    const { db, find } = setup();

    await find("sample-store");

    expect(db.query.store.findFirst).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        columns: {
          colorAccent: true,
          colorBackground: true,
          colorContrast: true,
          colorForeground: true,
          colorSurface: true,
          currencyCode: true,
          id: true,
          instagramUrl: true,
          logoUrl: true,
          name: true,
          slug: true,
          tiktokUrl: true,
          whatsappNumber: true,
        },
        with: {
          translations: {
            columns: { description: true, locale: true, tagline: true },
          },
        },
      })
    );
  });

  test("returns the store it found", async () => {
    const { db, find } = setup();
    const found = { id: 7, slug: "sample-store", translations: [SPANISH] };
    db.query.store.findFirst.mockResolvedValue(found);

    await expect(find("sample-store")).resolves.toBe(found);
  });

  test("returns null, never undefined, when there is no such store", async () => {
    const { find } = setup();

    await expect(find("sample-store")).resolves.toBeNull();
  });
});

describe("getActiveStoreBySlug", () => {
  test("returns the store it found", async () => {
    const { db, get } = setup();
    const found = { id: 7, slug: "sample-store", translations: [] };
    db.query.store.findFirst.mockResolvedValue(found);

    await expect(get("sample-store")).resolves.toBe(found);
  });

  test("answers NOT_FOUND when there is no such store", async () => {
    const { get } = setup();

    await expect(get("sample-store")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
  });
});

describe("listTakenStoreSlugs", () => {
  test("asks for all the slugs in one query, whatever their state", async () => {
    const { db, taken } = setup();

    await taken(["lr-market", "tienda-demo"]);

    const query = db.query.store.findMany.mock.calls[0]?.[0] as {
      columns: unknown;
      where: unknown;
    };
    expect(renderQuery(query.where)).toEqual({
      sql: '"store"."slug" in ($1, $2)',
      params: ["lr-market", "tienda-demo"],
    });
    expect(query.columns).toEqual({ slug: true });
  });

  test("returns the slugs that exist", async () => {
    const { db, taken } = setup();
    db.query.store.findMany.mockResolvedValue([{ slug: "tienda-demo" }]);

    await expect(taken(["lr-market", "tienda-demo"])).resolves.toEqual([
      "tienda-demo",
    ]);
  });
});

describe("createStore", () => {
  test("stores the store and its texts in one transaction and returns both", async () => {
    const { answerWrites, create, db } = setup();
    answerWrites("insert", makeRow(), [SPANISH, ENGLISH]);

    await expect(
      create(makeValues({ translations: [SPANISH, ENGLISH] }))
    ).resolves.toEqual({ ...makeRow(), translations: [SPANISH, ENGLISH] });

    const { translations: _translations, ...columns } = makeValues();
    expect(db.$.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function)
    );
    expect(db.$.insert.mock.calls).toEqual([[store], [storeTranslation]]);
    expect(db.$["insert.values"].mock.calls).toEqual([
      [columns],
      [
        [
          { ...SPANISH, storeId: 7 },
          { ...ENGLISH, storeId: 7 },
        ],
      ],
    ]);
  });

  test("writes only the columns it names, whatever else the values carry", async () => {
    const { answerWrites, create, db } = setup();
    answerWrites("insert", makeRow());
    const { translations: _translations, ...columns } = makeValues();

    await create({ ...makeValues(), id: 99, createdAt: STORED_AT } as never);

    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith(columns);
  });

  test("a store with no texts inserts none", async () => {
    const { answerWrites, create, db } = setup();
    answerWrites("insert", makeRow());

    await expect(create(makeValues())).resolves.toEqual({
      ...makeRow(),
      translations: [],
    });
    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(store);
  });

  test("fails loudly when the insert returns no row, before writing any text", async () => {
    const { answerWrites, create, db } = setup();
    answerWrites("insert", undefined);

    await expect(
      create(makeValues({ translations: [SPANISH] }))
    ).rejects.toThrow("Inserting a store returned no row");
    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(store);
  });

  test("answers CONFLICT, naming the address, when another store holds the slug", async () => {
    const { create, db } = setup();
    db.$["insert.returning"].mockRejectedValue(
      violation("23505", "store_slug_unique")
    );

    await expect(create(makeValues())).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Another store already uses that address. Choose another one",
    });
  });

  test.each([
    ["another constraint", violation("23505", "store_translation_pkey")],
    ["a check", violation("23514", "store_slug_not_reserved")],
  ])(
    "lets a violation of %s reach the interceptor untouched",
    async (_case, error) => {
      const { create, db } = setup();
      db.$["insert.returning"].mockRejectedValue(error);

      await expect(create(makeValues())).rejects.toBe(error);
    }
  );
});

describe("updateStore", () => {
  test("replaces the store's columns by id and returns the row with its texts", async () => {
    const { answerWrites, db, update } = setup();
    answerWrites("update", makeRow({ name: "Renamed" }), [SPANISH]);

    await expect(
      update({
        ...makeValues({ name: "Renamed", translations: [SPANISH] }),
        id: 7,
      })
    ).resolves.toEqual({
      ...makeRow({ name: "Renamed" }),
      translations: [SPANISH],
    });

    const { translations: _translations, ...columns } = makeValues({
      name: "Renamed",
    });
    expect(db.$.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function)
    );
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(store);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith(columns);
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      sql: '"store"."id" = $1',
      params: [7],
    });
  });

  test("answers NOT_FOUND for an id that matches nothing, touching no text", async () => {
    const { answerWrites, db, update } = setup();
    answerWrites("update", undefined);

    await expect(
      update({ ...makeValues({ translations: [SPANISH] }), id: 404 })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Store not found" });
    expect(db.$.delete).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("deletes this store's texts in the languages left out", async () => {
    const { answerWrites, db, update } = setup();
    answerWrites("update", makeRow(), [SPANISH]);

    await update({ ...makeValues({ translations: [SPANISH] }), id: 7 });

    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(storeTranslation);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      sql: '("store_translation"."storeId" = $1 and "store_translation"."locale" not in ($2))',
      params: [7, "es"],
    });
  });

  test("with no texts sent, deletes every text of this store and inserts none", async () => {
    const { answerWrites, db, update } = setup();
    answerWrites("update", makeRow());

    await expect(update({ ...makeValues(), id: 7 })).resolves.toEqual({
      ...makeRow(),
      translations: [],
    });

    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      sql: '"store_translation"."storeId" = $1',
      params: [7],
    });
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("writes each text over the one its language already has", async () => {
    const { answerWrites, db, update } = setup();
    answerWrites("update", makeRow(), [SPANISH, ENGLISH]);

    await update({
      ...makeValues({ translations: [SPANISH, ENGLISH] }),
      id: 7,
    });

    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(storeTranslation);
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
      { ...SPANISH, storeId: 7 },
      { ...ENGLISH, storeId: 7 },
    ]);
    const conflict = db.$["insert.onConflictDoUpdate"].mock.calls[0]?.[0] as {
      set: Record<string, unknown>;
      target: unknown;
    };
    expect(conflict.target).toEqual([
      storeTranslation.storeId,
      storeTranslation.locale,
    ]);
    expect(
      Object.fromEntries(
        Object.entries(conflict.set).map(([column, value]) => [
          column,
          renderSql(value),
        ])
      )
    ).toEqual({
      description: 'excluded."description"',
      tagline: 'excluded."tagline"',
      updatedAt: 'excluded."updatedAt"',
    });
  });

  test("answers CONFLICT when the new slug belongs to another store", async () => {
    const { db, update } = setup();
    db.$["update.returning"].mockRejectedValue(
      violation("23505", "store_slug_unique")
    );

    await expect(update({ ...makeValues(), id: 7 })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Another store already uses that address. Choose another one",
    });
  });
});
