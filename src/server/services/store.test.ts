import { describe, expect, test } from "vitest";

import type { UpdateStoreValues } from "@/lib/schemas/store";
import { store, storeTranslation } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery, renderSql } from "@/server/test/render-sql";

import {
  addMissingStoreTexts,
  findStore,
  getStore,
  updateStore,
} from "./store";

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
  overrides: Partial<UpdateStoreValues> = {}
): UpdateStoreValues {
  return {
    instagramUrl: "https://instagram.com/sample",
    name: "Sample Store",
    tiktokUrl: null,
    translations: [],
    whatsappNumber: "+59899123456",
    ...overrides,
  };
}

/**
 * The row Postgres hands back for {@link makeValues}, with the currency the
 * store keeps.
 */
function makeRow(overrides: Partial<UpdateStoreValues> = {}) {
  const { translations: _translations, ...columns } = makeValues(overrides);

  return { ...columns, currencyCode: "UYU" as const, id: 7 };
}

/**
 * A database whose store row the update's lock finds (or not), whose update
 * answers `row` (or, `null`, nothing), and whose texts' insert answers `translations`.
 */
function setup({
  locked = [{ id: 7 }],
  row = makeRow(),
  translations = [],
}: {
  locked?: { id: number }[];
  row?: ReturnType<typeof makeRow> | null;
  translations?: unknown[];
} = {}) {
  const db = createMockDatabase();
  db.$["select.for"].mockResolvedValue(locked);
  db.$["update.returning"].mockResolvedValue(row ? [row] : []);
  db.$["insert.returning"].mockResolvedValue(translations);

  return {
    db,
    update: async (values: UpdateStoreValues) =>
      await updateStore(db as never, values),
  };
}

describe("findStore", () => {
  test("reads the table's row with what a public page shows and its texts, and nothing internal", async () => {
    const db = createMockDatabase();

    await findStore(db as never);

    expect(db.query.store.findFirst).toHaveBeenCalledExactlyOnceWith({
      columns: {
        currencyCode: true,
        id: true,
        instagramUrl: true,
        name: true,
        tiktokUrl: true,
        whatsappNumber: true,
      },
      with: {
        translations: {
          columns: {
            description: true,
            locale: true,
            location: true,
            tagline: true,
          },
        },
      },
    });
  });

  test("returns the store it found", async () => {
    const db = createMockDatabase();
    const found = { ...makeRow(), translations: [SPANISH] };
    db.query.store.findFirst.mockResolvedValue(found);

    await expect(findStore(db as never)).resolves.toBe(found);
  });

  test("returns null, never undefined, before the row exists", async () => {
    const db = createMockDatabase();

    await expect(findStore(db as never)).resolves.toBeNull();
  });
});

describe("getStore", () => {
  test("returns the store it found", async () => {
    const db = createMockDatabase();
    const found = { ...makeRow(), translations: [] };
    db.query.store.findFirst.mockResolvedValue(found);

    await expect(getStore(db as never)).resolves.toBe(found);
  });

  test("answers NOT_FOUND before the row exists", async () => {
    const db = createMockDatabase();

    await expect(getStore(db as never)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
  });
});

describe("updateStore", () => {
  test("locks the store's row, replaces its columns by that row's id, and returns it with its texts", async () => {
    const { db, update } = setup({
      row: makeRow({ name: "Renamed" }),
      translations: [SPANISH],
    });

    await expect(
      update(makeValues({ name: "Renamed", translations: [SPANISH] }))
    ).resolves.toEqual({
      ...makeRow({ name: "Renamed" }),
      translations: [SPANISH],
    });

    expect(db.$.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function)
    );
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(store);
    expect(db.$["select.for"]).toHaveBeenCalledExactlyOnceWith("update");
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(store);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      instagramUrl: "https://instagram.com/sample",
      name: "Renamed",
      tiktokUrl: null,
      whatsappNumber: "+59899123456",
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      sql: '"store"."id" = $1',
      params: [7],
    });
    expect(db.$["select.for"].mock.invocationCallOrder[0]).toBeLessThan(
      db.$.update.mock.invocationCallOrder[0] ?? 0
    );
  });

  test("writes only the columns it names, whatever else the values carry: never an id, nor the currency", async () => {
    const { db, update } = setup();

    await update({
      ...makeValues(),
      currencyCode: "USD",
      id: 99,
      slug: "another",
    } as unknown as UpdateStoreValues);

    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      instagramUrl: "https://instagram.com/sample",
      name: "Sample Store",
      tiktokUrl: null,
      whatsappNumber: "+59899123456",
    });
    // The id written is the locked row's, never one from the values.
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0]).params).toEqual(
      [7]
    );
  });

  test("answers NOT_FOUND before the row exists, writing nothing", async () => {
    const { db, update } = setup({ locked: [] });

    await expect(
      update(makeValues({ translations: [SPANISH] }))
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Store not found" });
    expect(db.$.update).not.toHaveBeenCalled();
    expect(db.$.delete).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("answers NOT_FOUND when the update matches nothing, touching no text", async () => {
    const { db, update } = setup({ row: null });

    await expect(
      update(makeValues({ translations: [SPANISH] }))
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Store not found" });
    expect(db.$.delete).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("deletes the store's texts in the languages left out", async () => {
    const { db, update } = setup({ translations: [SPANISH] });

    await update(makeValues({ translations: [SPANISH] }));

    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(storeTranslation);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      sql: '("store_translation"."storeId" = $1 and "store_translation"."locale" not in ($2))',
      params: [7, "es"],
    });
  });

  test("with no texts sent, deletes every text of the store and inserts none", async () => {
    const { db, update } = setup();

    await expect(update(makeValues())).resolves.toEqual({
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
    const { db, update } = setup({ translations: [SPANISH, ENGLISH] });

    await update(makeValues({ translations: [SPANISH, ENGLISH] }));

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
});

describe("updateStore: where to find the store (FER-078)", () => {
  /** The columns an edit's upsert overwrites on a text that exists. */
  function overwrittenBy(db: ReturnType<typeof setup>["db"]) {
    const conflict = db.$["insert.onConflictDoUpdate"].mock.calls[0]?.[0] as {
      set: Record<string, unknown>;
    };

    return Object.fromEntries(
      Object.entries(conflict.set).map(([column, value]) => [
        column,
        renderSql(value),
      ])
    );
  }

  test("an edit that names it in every text writes it, a text or none, over the stored one", async () => {
    const { db, update } = setup();
    const texts = [
      { ...SPANISH, location: "Feria del Parque · Puesto 12" },
      { ...ENGLISH, location: null },
    ];

    await update(makeValues({ translations: texts }));

    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
      { ...SPANISH, location: "Feria del Parque · Puesto 12", storeId: 7 },
      { ...ENGLISH, location: null, storeId: 7 },
    ]);
    expect(overwrittenBy(db)).toEqual({
      description: 'excluded."description"',
      location: 'excluded."location"',
      tagline: 'excluded."tagline"',
      updatedAt: 'excluded."updatedAt"',
    });
  });

  test.each([
    ["names it in no text", [SPANISH, ENGLISH]],
    [
      "names it in one text only",
      [{ ...SPANISH, location: "Feria del Parque" }, ENGLISH],
    ],
  ])(
    "an edit that %s (a tab opened before the field existed) keeps the stored ones",
    async (_case, texts) => {
      const { db, update } = setup();

      await update(makeValues({ translations: texts }));

      expect(overwrittenBy(db)).toEqual({
        description: 'excluded."description"',
        tagline: 'excluded."tagline"',
        updatedAt: 'excluded."updatedAt"',
      });
    }
  );

  test("reads it back with each text", async () => {
    const stored = [{ ...SPANISH, location: "Feria del Parque" }];
    const { db, update } = setup({ translations: stored });

    await expect(
      update(makeValues({ translations: stored }))
    ).resolves.toMatchObject({ translations: stored });
    expect(db.$["insert.returning"]).toHaveBeenCalledExactlyOnceWith({
      description: storeTranslation.description,
      locale: storeTranslation.locale,
      location: storeTranslation.location,
      tagline: storeTranslation.tagline,
    });
  });
});

describe("addMissingStoreTexts", () => {
  test("inserts the texts, leaves a language the store already has alone, and answers the languages added", async () => {
    const db = createMockDatabase();
    db.$["insert.returning"].mockResolvedValue([{ locale: "en" }]);

    await expect(
      addMissingStoreTexts(db as never, {
        storeId: 7,
        translations: [SPANISH, ENGLISH],
      })
    ).resolves.toEqual(["en"]);

    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(storeTranslation);
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
      { ...SPANISH, storeId: 7 },
      { ...ENGLISH, storeId: 7 },
    ]);
    expect(db.$["insert.onConflictDoNothing"]).toHaveBeenCalledExactlyOnceWith({
      target: [storeTranslation.storeId, storeTranslation.locale],
    });
    expect(db.$["insert.returning"]).toHaveBeenCalledExactlyOnceWith({
      locale: storeTranslation.locale,
    });
  });

  test("asks nothing for no texts", async () => {
    const db = createMockDatabase();

    await expect(
      addMissingStoreTexts(db as never, { storeId: 7, translations: [] })
    ).resolves.toEqual([]);
    expect(db.$.insert).not.toHaveBeenCalled();
  });
});
