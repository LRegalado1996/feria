import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import type { CreateStoreValues } from "@/lib/schemas/store";
import { store, storeTranslation } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery, renderSql } from "@/server/test/render-sql";

import {
  createStore,
  findActiveStoreBySlug,
  findDefaultStore,
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
    isDefault: false,
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

/** When a spy was first called, among every spy's calls; fails if it never was. */
function firstCallOrder(
  spy: { mock: { invocationCallOrder: number[] } } | undefined
) {
  const order = spy?.mock.invocationCallOrder[0];

  if (order === undefined) {
    throw new Error("The spy was never called");
  }

  return order;
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

describe("findDefaultStore", () => {
  test("reads the id and the address of the store marked as the default", async () => {
    const { db } = setup();
    db.query.store.findFirst.mockResolvedValue({ id: 7, slug: "lr-market" });

    await expect(findDefaultStore(db as never)).resolves.toEqual({
      id: 7,
      slug: "lr-market",
    });

    const query = db.query.store.findFirst.mock.calls[0]?.[0] as {
      columns: unknown;
      where: unknown;
    };
    expect(query.columns).toEqual({ id: true, slug: true });
    expect(renderQuery(query.where)).toEqual({
      sql: '"store"."isDefault" = $1',
      params: [true],
    });
  });

  test("answers null, never undefined, when no store is the default", async () => {
    const { db } = setup();

    await expect(findDefaultStore(db as never)).resolves.toBeNull();
  });
});

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

describe("the default store", () => {
  test("a store created as the default first takes the mark from the store that has it", async () => {
    const { answerWrites, create, db } = setup();
    answerWrites("insert", makeRow({ isDefault: true }));

    await create(makeValues({ isDefault: true }));

    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(store);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      isDefault: false,
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      sql: '"store"."isDefault" = $1',
      params: [true],
    });
    // Unmarked before the new default is written, or the index refuses it.
    expect(firstCallOrder(db.$["update.where"])).toBeLessThan(
      firstCallOrder(db.$["insert.values"])
    );
  });

  test("a store created as an ordinary one leaves the default alone", async () => {
    const { answerWrites, create, db } = setup();
    answerWrites("insert", makeRow());

    await create(makeValues({ isDefault: false }));

    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("an edit that makes a store the default takes the one lock for that, then unmarks the other store", async () => {
    const { answerWrites, db, update } = setup();
    answerWrites("update", makeRow({ isDefault: true }));

    await update({ ...makeValues({ isDefault: true }), id: 7 });

    expect(renderQuery(db.$.execute.mock.calls[0]?.[0])).toEqual({
      sql: "select pg_advisory_xact_lock(hashtext($1))",
      params: ["store.default"],
    });
    expect(db.$["update.set"].mock.calls[0]).toEqual([{ isDefault: false }]);
    // Never the store being edited: it is about to be marked.
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      sql: '("store"."isDefault" = $1 and "store"."id" <> $2)',
      params: [true, 7],
    });
    expect(db.$["update.set"].mock.calls[1]).toEqual([
      expect.objectContaining({ isDefault: true }),
    ]);
    // The lock comes before any row is written.
    expect(firstCallOrder(db.$.execute)).toBeLessThan(
      firstCallOrder(db.$["update.set"])
    );
  });

  test("a store created as the default takes the same lock before unmarking", async () => {
    const { answerWrites, create, db } = setup();
    answerWrites("insert", makeRow({ isDefault: true }));

    await create(makeValues({ isDefault: true }));

    expect(renderQuery(db.$.execute.mock.calls[0]?.[0])).toEqual({
      sql: "select pg_advisory_xact_lock(hashtext($1))",
      params: ["store.default"],
    });
    expect(firstCallOrder(db.$.execute)).toBeLessThan(
      firstCallOrder(db.$["update.set"])
    );
  });

  test("an edit that does not make the store the default takes no lock and unmarks nothing", async () => {
    const { answerWrites, db, update } = setup();
    answerWrites("update", makeRow());

    await update({ ...makeValues({ isDefault: false }), id: 7 });

    expect(db.$.execute).not.toHaveBeenCalled();
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ isDefault: false, name: "Sample Store" })
    );
  });

  test("answers CONFLICT when someone else set the default in the same instant", async () => {
    const { db, update } = setup();
    db.$["update.returning"].mockRejectedValue(
      violation("23505", "store_single_default")
    );

    await expect(
      update({ ...makeValues({ isDefault: true }), id: 7 })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Another store was made the default just now. Try again",
    });
  });
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
