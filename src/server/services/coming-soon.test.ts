import { describe, expect, test } from "vitest";

import type { UpdateComingSoonValues } from "@/lib/schemas/coming-soon";
import { comingSoon, comingSoonTranslation } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery, renderSql } from "@/server/test/render-sql";

import {
  addComingSoonIfMissing,
  findComingSoon,
  isComingSoonPublished,
  setComingSoonPublished,
  updateComingSoon,
} from "./coming-soon";

const STORE_ID = 7;
const PAGE_ID = 3;

const SPANISH = {
  eyebrow: null,
  headline: "Abrimos\npronto",
  lead: "Te esperamos.",
  locale: "es",
  marquee: "Bijou",
} as const;
const ENGLISH = {
  eyebrow: null,
  headline: null,
  lead: "We open soon.",
  locale: "en",
  marquee: null,
} as const;

function makeValues(
  overrides: Partial<UpdateComingSoonValues> = {}
): UpdateComingSoonValues {
  return { countdownTo: "2026-12-20", translations: [], ...overrides };
}

/** An upsert's `set`, each value as the SQL it writes. */
function renderedSet(call: unknown) {
  const { set, target } = call as {
    set: Record<string, unknown>;
    target: unknown;
  };

  return {
    set: Object.fromEntries(
      Object.entries(set).map(([column, value]) => [column, renderSql(value)])
    ),
    target,
  };
}

/**
 * A database whose page upsert answers `page` (or nothing), and whose texts'
 * insert answers `translations`.
 */
function setup({
  page = { countdownTo: "2026-12-20", id: PAGE_ID, published: true },
  translations = [],
}: {
  page?: { countdownTo: string | null; id: number; published: boolean } | null;
  translations?: unknown[];
} = {}) {
  const db = createMockDatabase();
  db.$["insert.returning"]
    .mockResolvedValueOnce(page ? [page] : [])
    .mockResolvedValueOnce(translations);

  return {
    db,
    update: async (values: UpdateComingSoonValues) =>
      await updateComingSoon(db as never, STORE_ID, values),
  };
}

describe("findComingSoon", () => {
  test("reads the switch, the day and the texts, and nothing internal", async () => {
    const db = createMockDatabase();
    const found = {
      countdownTo: "2026-12-20",
      published: false,
      translations: [SPANISH],
    };
    db.query.comingSoon.findFirst.mockResolvedValue(found);

    await expect(findComingSoon(db as never)).resolves.toBe(found);
    expect(db.query.comingSoon.findFirst).toHaveBeenCalledExactlyOnceWith({
      columns: { countdownTo: true, published: true },
      with: {
        translations: {
          columns: {
            eyebrow: true,
            headline: true,
            lead: true,
            locale: true,
            marquee: true,
          },
        },
      },
    });
  });

  test("before anyone saved the page, it is published, counts to the fair and says the dictionary's", async () => {
    const db = createMockDatabase();

    await expect(findComingSoon(db as never)).resolves.toEqual({
      countdownTo: null,
      published: true,
      translations: [],
    });
  });
});

describe("isComingSoonPublished", () => {
  test.each([
    [[{ published: true }], true],
    [[{ published: false }], false],
    // No row yet: closed, so a fresh production stays behind the page.
    [[], true],
  ])("a row %j reads as published %s", async (rows, published) => {
    const db = createMockDatabase();
    db.$["select.limit"].mockResolvedValue(rows);

    await expect(isComingSoonPublished(db as never)).resolves.toBe(published);
    expect(db.$.select).toHaveBeenCalledExactlyOnceWith({
      published: comingSoon.published,
    });
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(comingSoon);
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(1);
  });
});

describe("updateComingSoon", () => {
  test("upserts the store's page with the day only, never the switch, in one transaction", async () => {
    const { db, update } = setup();

    await update(makeValues());

    expect(db.$.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function)
    );
    expect(db.$.insert.mock.calls[0]).toEqual([comingSoon]);
    expect(db.$["insert.values"].mock.calls[0]).toEqual([
      { countdownTo: "2026-12-20", storeId: STORE_ID },
    ]);
    expect(
      renderedSet(db.$["insert.onConflictDoUpdate"].mock.calls[0]?.[0])
    ).toEqual({
      set: {
        countdownTo: 'excluded."countdownTo"',
        updatedAt: 'excluded."updatedAt"',
      },
      target: comingSoon.storeId,
    });
  });

  test("writes each text over its language's, by the page's id, and answers the page as stored", async () => {
    const { db, update } = setup({
      page: { countdownTo: null, id: PAGE_ID, published: false },
      translations: [SPANISH, ENGLISH],
    });

    await expect(
      update(
        makeValues({ countdownTo: null, translations: [SPANISH, ENGLISH] })
      )
    ).resolves.toEqual({
      countdownTo: null,
      published: false,
      translations: [SPANISH, ENGLISH],
    });

    expect(db.$.insert.mock.calls[1]).toEqual([comingSoonTranslation]);
    expect(db.$["insert.values"].mock.calls[1]).toEqual([
      [
        { ...SPANISH, comingSoonId: PAGE_ID },
        { ...ENGLISH, comingSoonId: PAGE_ID },
      ],
    ]);
    expect(
      renderedSet(db.$["insert.onConflictDoUpdate"].mock.calls[1]?.[0])
    ).toEqual({
      set: {
        eyebrow: 'excluded."eyebrow"',
        headline: 'excluded."headline"',
        lead: 'excluded."lead"',
        marquee: 'excluded."marquee"',
        updatedAt: 'excluded."updatedAt"',
      },
      target: [
        comingSoonTranslation.comingSoonId,
        comingSoonTranslation.locale,
      ],
    });
    // The texts' row is written after the page's, whose id it needs.
    expect(db.$["insert.values"].mock.invocationCallOrder[0]).toBeLessThan(
      db.$["insert.values"].mock.invocationCallOrder[1] ?? 0
    );
  });

  test("deletes the texts of the languages left out", async () => {
    const { db, update } = setup({ translations: [SPANISH] });

    await update(makeValues({ translations: [SPANISH] }));

    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(comingSoonTranslation);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      sql: '("coming_soon_translation"."comingSoonId" = $1 and "coming_soon_translation"."locale" not in ($2))',
      params: [PAGE_ID, "es"],
    });
  });

  test("with no texts sent, deletes every text of the page and inserts none", async () => {
    const { db, update } = setup();

    await expect(update(makeValues())).resolves.toEqual({
      countdownTo: "2026-12-20",
      published: true,
      translations: [],
    });
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      sql: '"coming_soon_translation"."comingSoonId" = $1',
      params: [PAGE_ID],
    });
    expect(db.$.insert.mock.calls).toEqual([[comingSoon]]);
  });

  test("an upsert that answers no row is a bug, not a quiet success", async () => {
    const { db, update } = setup({ page: null });

    await expect(update(makeValues())).rejects.toThrow(
      "The coming-soon page's upsert answered no row"
    );
    expect(db.$.delete).not.toHaveBeenCalled();
  });
});

describe("setComingSoonPublished", () => {
  test.each([true, false])(
    "writes published %s on the store's page, and nothing else",
    async (published) => {
      const db = createMockDatabase();
      db.$["insert.returning"].mockResolvedValue([{ published }]);

      await expect(
        setComingSoonPublished(db as never, STORE_ID, published)
      ).resolves.toEqual({ published });
      expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(comingSoon);
      expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
        published,
        storeId: STORE_ID,
      });
      expect(
        renderedSet(db.$["insert.onConflictDoUpdate"].mock.calls[0]?.[0])
      ).toEqual({
        set: {
          published: 'excluded."published"',
          updatedAt: 'excluded."updatedAt"',
        },
        target: comingSoon.storeId,
      });
    }
  );

  test("an upsert that answers no row is a bug, not a quiet success", async () => {
    const db = createMockDatabase();

    await expect(
      setComingSoonPublished(db as never, STORE_ID, false)
    ).rejects.toThrow("The coming-soon page's upsert answered no row");
  });
});

describe("addComingSoonIfMissing", () => {
  test.each([
    [[{ id: PAGE_ID }], true],
    // The store already had its page: left alone.
    [[], false],
  ])(
    "inserts the page unless the store has one (answering %j), and says whether it did",
    async (rows, created) => {
      const db = createMockDatabase();
      db.$["insert.returning"].mockResolvedValue(rows);

      await expect(
        addComingSoonIfMissing(db as never, {
          published: false,
          storeId: STORE_ID,
        })
      ).resolves.toBe(created);
      expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
        published: false,
        storeId: STORE_ID,
      });
      expect(
        db.$["insert.onConflictDoNothing"]
      ).toHaveBeenCalledExactlyOnceWith({ target: comingSoon.storeId });
    }
  );
});
