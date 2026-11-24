import { describe, expect, test } from "vitest";

import type { CreatePageValues } from "@/lib/schemas/page";
import { category, page, pageTranslation, store } from "@/server/db/schema";
import { createMockDatabase, type MockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import {
  createPage,
  deletePage,
  findHomePage,
  findStorePage,
  listHeaderPages,
  listIndexablePages,
  listPages,
  setHomePage,
  updatePage,
} from "./page-settings";

// The rules on real rows (both sides of every address, the home's, two
// admins at once) are `page-settings.integration.test.ts`'s; here, what
// each function asks the database and what it makes of the answer.

const STORE_ID = 7;
const HOME_ID = 1;
const PAGE_ID = 9;
const LOCKS = [
  {
    params: [`pages:${STORE_ID}`],
    sql: "select pg_advisory_xact_lock(hashtext($1))",
  },
  {
    params: [`category:${STORE_ID}`],
    sql: "select pg_advisory_xact_lock(hashtext($1))",
  },
];

function makeValues(
  overrides: Partial<CreatePageValues> = {}
): CreatePageValues {
  return {
    isPublished: true,
    nameEn: "Gifts",
    nameEs: "Regalos",
    seoDescriptionEn: null,
    seoDescriptionEs: "Para regalar.",
    seoTitleEn: null,
    seoTitleEs: null,
    showInHeader: false,
    slug: "regalos",
    ...overrides,
  };
}

function makeTranslations() {
  return [
    {
      locale: "es" as const,
      name: "Regalos",
      seoDescription: "Para regalar.",
      seoTitle: "Regalos de Navidad",
    },
    {
      locale: "en" as const,
      name: "Gifts",
      seoDescription: null,
      seoTitle: null,
    },
  ];
}

/**
 * A database whose `select` chains answer by the table their `from` named:
 * the store's row (its home), a category or a page holding a slug, the page
 * a write is about.
 */
function setup({
  categories = [],
  home = HOME_ID,
  pages = [],
}: {
  categories?: unknown[];
  home?: number | null;
  pages?: unknown[];
} = {}) {
  const db = createMockDatabase();
  const rows = new Map<unknown, unknown[]>([
    [category, categories],
    [page, pages],
    [store, home === null ? [] : [{ homePageId: home }]],
  ]);
  const read: { table: unknown } = { table: null };
  const answer = async () => await Promise.resolve(rows.get(read.table) ?? []);

  db.$["select.from"].mockImplementation((table: unknown) => {
    read.table = table;
  });

  for (const step of ["where", "limit", "for"] as const) {
    db.$[`select.${step}`].mockImplementation(answer);
  }

  return { db, tx: db as never };
}

/** The tables the `select` chains read, their `where`s and locks, in order. */
function readsOf(db: MockDatabase) {
  return {
    locks: db.$["select.for"].mock.calls.map(([strength]) => strength),
    tables: db.$["select.from"].mock.calls.map(([table]) => table),
    wheres: db.$["select.where"].mock.calls.map(([where]) =>
      renderQuery(where)
    ),
  };
}

/** The `isHome` a page's relational read asks for, as SQL and parameters. */
function isHomeRead(query: unknown) {
  return renderQuery(
    (query as { extras: { isHome: { sql: unknown } } }).extras.isHome.sql
  );
}

function locksOf(db: MockDatabase) {
  return db.$.execute.mock.calls.map(([statement]) => renderQuery(statement));
}

describe("listPages", () => {
  test("lists the store's pages, the home first whatever its id, each with both languages' words", async () => {
    const { db, tx } = setup({ home: 4 });
    db.query.page.findMany.mockResolvedValue([
      {
        id: 2,
        isPublished: false,
        showInHeader: true,
        slug: "regalos",
        translations: makeTranslations(),
      },
      // No word in either language: an empty Spanish name, no English.
      {
        id: 4,
        isPublished: true,
        showInHeader: false,
        slug: "home",
        translations: [],
      },
    ]);

    await expect(listPages(tx, { storeId: STORE_ID })).resolves.toEqual([
      {
        id: 4,
        isHome: true,
        isPublished: true,
        nameEn: null,
        nameEs: "",
        seoDescriptionEn: null,
        seoDescriptionEs: null,
        seoTitleEn: null,
        seoTitleEs: null,
        showInHeader: false,
        slug: "home",
      },
      {
        id: 2,
        isHome: false,
        isPublished: false,
        nameEn: "Gifts",
        nameEs: "Regalos",
        seoDescriptionEn: null,
        seoDescriptionEs: "Para regalar.",
        seoTitleEn: null,
        seoTitleEs: "Regalos de Navidad",
        showInHeader: true,
        slug: "regalos",
      },
    ]);
    expect(readsOf(db).wheres).toEqual([
      { params: [STORE_ID], sql: '"store"."id" = $1' },
    ]);
    const [query] = db.query.page.findMany.mock.calls[0] ?? [];
    expect(renderQuery((query as { where: unknown }).where)).toEqual({
      params: [STORE_ID],
      sql: '"page"."storeId" = $1',
    });
  });
});

describe("createPage", () => {
  test("takes the pages' then the categories' lock, checks the address free, inserts the page and its words", async () => {
    const { db, tx } = setup();
    db.$["insert.returning"].mockResolvedValue([
      { id: PAGE_ID, slug: "regalos" },
    ]);

    await expect(
      createPage(tx, { storeId: STORE_ID, values: makeValues() })
    ).resolves.toEqual({ id: PAGE_ID, slug: "regalos" });

    expect(locksOf(db)).toEqual(LOCKS);
    expect(readsOf(db)).toEqual({
      locks: [],
      tables: [category, page],
      wheres: [
        {
          params: [STORE_ID, "regalos"],
          sql: '("category"."storeId" = $1 and "category"."slug" = $2)',
        },
        {
          params: [STORE_ID, "regalos"],
          sql: '("page"."storeId" = $1 and "page"."slug" = $2)',
        },
      ],
    });
    expect(db.$.insert.mock.calls).toEqual([[page], [pageTranslation]]);
    expect(db.$["insert.values"].mock.calls).toEqual([
      [
        {
          isPublished: true,
          showInHeader: false,
          slug: "regalos",
          storeId: STORE_ID,
        },
      ],
      [
        [
          {
            locale: "es",
            name: "Regalos",
            pageId: PAGE_ID,
            seoDescription: "Para regalar.",
            seoTitle: null,
          },
          {
            locale: "en",
            name: "Gifts",
            pageId: PAGE_ID,
            seoDescription: null,
            seoTitle: null,
          },
        ],
      ],
    ]);
    // Both languages written: no English row to take away.
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("without an English name writes the Spanish only, and leaves no English row", async () => {
    const { db, tx } = setup();
    db.$["insert.returning"].mockResolvedValue([
      { id: PAGE_ID, slug: "regalos" },
    ]);

    await createPage(tx, {
      storeId: STORE_ID,
      values: makeValues({ nameEn: null }),
    });

    expect(db.$["insert.values"].mock.calls[1]).toEqual([
      [
        {
          locale: "es",
          name: "Regalos",
          pageId: PAGE_ID,
          seoDescription: "Para regalar.",
          seoTitle: null,
        },
      ],
    ]);
    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(pageTranslation);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [PAGE_ID, "en"],
      sql: '("page_translation"."pageId" = $1 and "page_translation"."locale" = $2)',
    });
  });

  test.each([
    "productos",
    "contacto",
    "admin",
    "en",
    "Regalos",
    "regalos-",
    "",
  ])(
    "refuses %j, an address the site uses or no address at all, as BAD_REQUEST before any read",
    async (slug) => {
      const { db, tx } = setup();

      await expect(
        createPage(tx, { storeId: STORE_ID, values: makeValues({ slug }) })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "That address is one the site uses",
      });
      expect(db.$["select.from"]).not.toHaveBeenCalled();
      expect(db.$.insert).not.toHaveBeenCalled();
    }
  );

  test.each([
    ["a category", { categories: [{ id: 3 }] }],
    ["another page", { pages: [{ id: 2 }] }],
  ])(
    "refuses an address %s has as CONFLICT, inserting nothing",
    async (_holder, taken) => {
      const { db, tx } = setup(taken);

      await expect(
        createPage(tx, { storeId: STORE_ID, values: makeValues() })
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Another page or category already has that address",
      });
      expect(db.$.insert).not.toHaveBeenCalled();
    }
  );

  test("throws when the insert answers no row", async () => {
    const { db, tx } = setup();
    db.$["insert.returning"].mockResolvedValue([]);

    await expect(
      createPage(tx, { storeId: STORE_ID, values: makeValues() })
    ).rejects.toThrow("Inserting a page returned no row");
    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(page);
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
      isPublished: true,
      showInHeader: false,
      slug: "regalos",
      storeId: STORE_ID,
    });
  });
});

describe("updatePage", () => {
  test("holds the store's row and the page, checks a new address free but this page, then writes", async () => {
    const { db, tx } = setup({ pages: [{ id: PAGE_ID, slug: "regalos" }] });
    db.$["select.limit"].mockResolvedValue([]);

    await expect(
      updatePage(tx, {
        storeId: STORE_ID,
        values: { ...makeValues({ slug: "navidad" }), id: PAGE_ID },
      })
    ).resolves.toEqual({
      id: PAGE_ID,
      previousSlug: "regalos",
      slug: "navidad",
    });

    expect(locksOf(db)).toEqual(LOCKS);
    expect(readsOf(db)).toEqual({
      locks: ["update", "update"],
      tables: [store, page, category, page],
      wheres: [
        { params: [STORE_ID], sql: '"store"."id" = $1' },
        {
          params: [PAGE_ID, STORE_ID],
          sql: '("page"."id" = $1 and "page"."storeId" = $2)',
        },
        {
          params: [STORE_ID, "navidad"],
          sql: '("category"."storeId" = $1 and "category"."slug" = $2)',
        },
        {
          params: [STORE_ID, "navidad", PAGE_ID],
          sql: '("page"."storeId" = $1 and "page"."slug" = $2 and "page"."id" <> $3)',
        },
      ],
    });
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(page);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      isPublished: true,
      showInHeader: false,
      slug: "navidad",
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [PAGE_ID, STORE_ID],
      sql: '("page"."id" = $1 and "page"."storeId" = $2)',
    });
    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(pageTranslation);
  });

  test("keeping its address, checks nothing about it", async () => {
    const { db, tx } = setup({ pages: [{ id: PAGE_ID, slug: "regalos" }] });

    await updatePage(tx, {
      storeId: STORE_ID,
      values: { ...makeValues(), id: PAGE_ID },
    });

    expect(readsOf(db).tables).toEqual([store, page]);
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(page);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      isPublished: true,
      showInHeader: false,
      slug: "regalos",
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [PAGE_ID, STORE_ID],
      sql: '("page"."id" = $1 and "page"."storeId" = $2)',
    });
  });

  test("the home stays published: unpublishing it is BAD_REQUEST, writing nothing", async () => {
    const { db, tx } = setup({
      home: PAGE_ID,
      pages: [{ id: PAGE_ID, slug: "home" }],
    });

    await expect(
      updatePage(tx, {
        storeId: STORE_ID,
        values: {
          ...makeValues({ isPublished: false, slug: "home" }),
          id: PAGE_ID,
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The home cannot be unpublished: choose another home first",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("the home, published, can change everything else", async () => {
    const { db, tx } = setup({
      home: PAGE_ID,
      pages: [{ id: PAGE_ID, slug: "home" }],
    });

    await updatePage(tx, {
      storeId: STORE_ID,
      values: {
        ...makeValues({
          nameEn: "Front",
          nameEs: "Portada",
          seoDescriptionEn: "All the store.",
          seoTitleEs: "Inicio",
          slug: "home",
        }),
        id: PAGE_ID,
      },
    });

    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      isPublished: true,
      showInHeader: false,
      slug: "home",
    });
    expect(db.$["insert.values"].mock.calls).toEqual([
      [
        [
          {
            locale: "es",
            name: "Portada",
            pageId: PAGE_ID,
            seoDescription: "Para regalar.",
            seoTitle: "Inicio",
          },
          {
            locale: "en",
            name: "Front",
            pageId: PAGE_ID,
            seoDescription: "All the store.",
            seoTitle: null,
          },
        ],
      ],
    ]);
  });

  test("another page may be unpublished", async () => {
    const { db, tx } = setup({ pages: [{ id: PAGE_ID, slug: "regalos" }] });

    await updatePage(tx, {
      storeId: STORE_ID,
      values: { ...makeValues({ isPublished: false }), id: PAGE_ID },
    });

    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ isPublished: false })
    );
  });

  test("a page the store does not have is NOT_FOUND", async () => {
    const { db, tx } = setup();

    await expect(
      updatePage(tx, {
        storeId: STORE_ID,
        values: { ...makeValues(), id: 99 },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Page not found" });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("a store with no row is NOT_FOUND", async () => {
    const { tx } = setup({ home: null });

    await expect(
      updatePage(tx, {
        storeId: STORE_ID,
        values: { ...makeValues(), id: PAGE_ID },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Store not found" });
  });
});

describe("deletePage", () => {
  test("holds the store's row, then deletes the store's page by its id", async () => {
    const { db, tx } = setup();
    db.$["delete.returning"].mockResolvedValue([
      { id: PAGE_ID, slug: "regalos" },
    ]);

    await expect(
      deletePage(tx, { id: PAGE_ID, storeId: STORE_ID })
    ).resolves.toEqual({ id: PAGE_ID, slug: "regalos" });

    expect(locksOf(db)).toEqual([LOCKS[0]]);
    expect(readsOf(db).locks).toEqual(["update"]);
    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(page);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [PAGE_ID, STORE_ID],
      sql: '("page"."id" = $1 and "page"."storeId" = $2)',
    });
  });

  test("refuses the home as BAD_REQUEST, deleting nothing", async () => {
    const { db, tx } = setup({ home: PAGE_ID });

    await expect(
      deletePage(tx, { id: PAGE_ID, storeId: STORE_ID })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The home cannot be deleted: choose another home first",
    });
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("a page the store does not have is NOT_FOUND", async () => {
    const { db, tx } = setup();
    db.$["delete.returning"].mockResolvedValue([]);

    await expect(
      deletePage(tx, { id: 99, storeId: STORE_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Page not found" });
  });
});

describe("setHomePage", () => {
  test("holds the store's row and the page, then points the store at it, answering both homes", async () => {
    const { db, tx } = setup({ pages: [{ id: PAGE_ID, isPublished: true }] });

    await expect(
      setHomePage(tx, { pageId: PAGE_ID, storeId: STORE_ID })
    ).resolves.toEqual({ homePageId: PAGE_ID, previousHomeId: HOME_ID });

    expect(locksOf(db)).toEqual([LOCKS[0]]);
    expect(readsOf(db)).toEqual({
      locks: ["update", "key share"],
      tables: [store, page],
      wheres: [
        { params: [STORE_ID], sql: '"store"."id" = $1' },
        {
          params: [PAGE_ID, STORE_ID],
          sql: '("page"."id" = $1 and "page"."storeId" = $2)',
        },
      ],
    });
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(store);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      homePageId: PAGE_ID,
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID],
      sql: '"store"."id" = $1',
    });
  });

  test("refuses a draft as BAD_REQUEST, changing nothing", async () => {
    const { db, tx } = setup({ pages: [{ id: PAGE_ID, isPublished: false }] });

    await expect(
      setHomePage(tx, { pageId: PAGE_ID, storeId: STORE_ID })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Only a published page can be the home",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("a page the store does not have is NOT_FOUND", async () => {
    const { db, tx } = setup();

    await expect(
      setHomePage(tx, { pageId: 99, storeId: STORE_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Page not found" });
    expect(db.$.update).not.toHaveBeenCalled();
  });
});

describe("findStorePage", () => {
  test("finds the store's page by its address, in the language asked, saying whether it is the home", async () => {
    const { db, tx } = setup({ home: PAGE_ID });
    db.query.page.findFirst.mockResolvedValue({
      id: PAGE_ID,
      isHome: true,
      isPublished: true,
      slug: "regalos",
      translations: makeTranslations(),
      updatedAt: new Date(),
    });

    await expect(
      findStorePage(tx, { locale: "es", slug: "regalos", storeId: STORE_ID })
    ).resolves.toEqual({
      id: PAGE_ID,
      isHome: true,
      isPublished: true,
      lang: "es",
      name: "Regalos",
      seoDescription: "Para regalar.",
      seoTitle: "Regalos de Navidad",
      slug: "regalos",
    });
    const [query] = db.query.page.findFirst.mock.calls[0] ?? [];
    expect(renderQuery((query as { where: unknown }).where)).toEqual({
      params: [STORE_ID, "regalos"],
      sql: '("page"."storeId" = $1 and "page"."slug" = $2)',
    });
    // Whether it is the home is read in the page's own statement.
    expect(isHomeRead(query)).toEqual({
      params: [STORE_ID],
      sql: '"page"."id" = (select "homePageId" from "store" where "id" = $1)',
    });
    expect(db.$["select.from"]).not.toHaveBeenCalled();
  });

  test("in English, a page with no English words speaks Spanish, and is not the home", async () => {
    const { db, tx } = setup();
    db.query.page.findFirst.mockResolvedValue({
      id: PAGE_ID,
      isHome: false,
      isPublished: false,
      slug: "regalos",
      translations: makeTranslations().slice(0, 1),
      updatedAt: new Date(),
    });

    await expect(
      findStorePage(tx, { locale: "en", slug: "regalos", storeId: STORE_ID })
    ).resolves.toMatchObject({
      isHome: false,
      isPublished: false,
      lang: "es",
      name: "Regalos",
    });
  });

  test("a page with no words at all has an empty name in the language asked", async () => {
    const { db, tx } = setup();
    db.query.page.findFirst.mockResolvedValue({
      id: PAGE_ID,
      isHome: false,
      isPublished: true,
      slug: "regalos",
      translations: [],
      updatedAt: new Date(),
    });

    await expect(
      findStorePage(tx, { locale: "en", slug: "regalos", storeId: STORE_ID })
    ).resolves.toMatchObject({
      lang: "en",
      name: "",
      seoDescription: null,
      seoTitle: null,
    });
  });

  test("answers null for an address the store has no page at, reading no home", async () => {
    const { db, tx } = setup();

    await expect(
      findStorePage(tx, { locale: "es", slug: "nada", storeId: STORE_ID })
    ).resolves.toBeNull();
    expect(db.$["select.from"]).not.toHaveBeenCalled();
  });
});

describe("findHomePage", () => {
  test("finds the page the store points at in the same statement that reads it", async () => {
    const { db, tx } = setup({ home: 4 });
    db.query.page.findFirst.mockResolvedValue({
      id: 4,
      isHome: true,
      isPublished: true,
      slug: "home",
      translations: [],
      updatedAt: new Date(),
    });

    await expect(
      findHomePage(tx, { locale: "es", storeId: STORE_ID })
    ).resolves.toMatchObject({ id: 4, isHome: true, slug: "home" });
    const [query] = db.query.page.findFirst.mock.calls[0] ?? [];
    expect(renderQuery((query as { where: unknown }).where)).toEqual({
      params: [STORE_ID, STORE_ID],
      sql: '("page"."storeId" = $1 and "page"."id" = (select "homePageId" from "store" where "id" = $2))',
    });
    expect(isHomeRead(query)).toEqual({
      params: [STORE_ID],
      sql: '"page"."id" = (select "homePageId" from "store" where "id" = $1)',
    });
    expect(db.$["select.from"]).not.toHaveBeenCalled();
  });
});

describe("the storefront's lists", () => {
  test("the header lists the store's published pages it shows there but the home, each a link to its address", async () => {
    const { db, tx } = setup();
    db.query.page.findMany.mockResolvedValue([
      { id: PAGE_ID, slug: "regalos", translations: makeTranslations() },
      { id: 10, slug: "ofertas", translations: [] },
    ]);

    await expect(
      listHeaderPages(tx, { locale: "en", storeId: STORE_ID })
    ).resolves.toEqual([
      {
        id: PAGE_ID,
        lang: "en",
        name: "Gifts",
        path: "/regalos",
        slug: "regalos",
      },
      { id: 10, lang: "en", name: "", path: "/ofertas", slug: "ofertas" },
    ]);
    const [query] = db.query.page.findMany.mock.calls[0] ?? [];
    expect(renderQuery((query as { where: unknown }).where)).toEqual({
      params: [STORE_ID, true, true, HOME_ID],
      sql: '("page"."storeId" = $1 and "page"."isPublished" = $2 and "page"."showInHeader" = $3 and "page"."id" <> $4)',
    });
  });

  test("search engines are told about the store's published pages but the home, with when each changed", async () => {
    const { db, tx } = setup();
    const updatedAt = new Date("2026-11-14T10:00:00.000Z");
    db.query.page.findMany.mockResolvedValue([
      {
        id: PAGE_ID,
        slug: "regalos",
        translations: makeTranslations(),
        updatedAt,
      },
      { id: 10, slug: "ofertas", translations: [], updatedAt },
    ]);

    await expect(
      listIndexablePages(tx, { locale: "es", storeId: STORE_ID })
    ).resolves.toEqual([
      { name: "Regalos", path: "/regalos", updatedAt },
      { name: "", path: "/ofertas", updatedAt },
    ]);
    const [query] = db.query.page.findMany.mock.calls[0] ?? [];
    expect(renderQuery((query as { where: unknown }).where)).toEqual({
      params: [STORE_ID, true, HOME_ID],
      sql: '("page"."storeId" = $1 and "page"."isPublished" = $2 and "page"."id" <> $3)',
    });
  });
});
