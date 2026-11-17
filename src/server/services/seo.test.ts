import { describe, expect, test } from "vitest";

import {
  category,
  categoryTranslation,
  product,
  productTranslation,
} from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderOrderBy, renderQuery } from "@/server/test/render-sql";

import {
  findIndexableStore,
  listIndexableArticles,
  listIndexableCategories,
} from "./seo";

const STORE_ID = 3;
const UPDATED_AT = new Date("2026-11-14T12:00:00.000Z");

/** What a relational read was given. */
interface ReadConfig {
  columns: Record<string, boolean>;
  with: unknown;
}

function setup() {
  const db = createMockDatabase();

  return {
    configOf: (fn: (typeof db.query)["store"]["findFirst"]) =>
      fn.mock.calls[0]?.[0] as ReadConfig,
    db,
  };
}

describe("findIndexableStore", () => {
  test("reads the table's one row with what the sitemap and llms.txt say, and its texts", async () => {
    const { configOf, db } = setup();
    const found = {
      currencyCode: "UYU",
      id: 1,
      name: "LR Market",
      translations: [],
      updatedAt: UPDATED_AT,
    };
    db.query.store.findFirst.mockResolvedValue(found);

    await expect(findIndexableStore(db as never)).resolves.toBe(found);

    expect(configOf(db.query.store.findFirst)).toEqual({
      columns: { currencyCode: true, id: true, name: true, updatedAt: true },
      with: {
        translations: {
          columns: { description: true, locale: true, tagline: true },
        },
      },
    });
  });

  test("answers null, never undefined, before the row exists", async () => {
    const { db } = setup();

    await expect(findIndexableStore(db as never)).resolves.toBeNull();
  });
});

/** Answers the translation reads, which end at `.where`, by their table. */
function answerTexts(db: ReturnType<typeof setup>["db"], rows: unknown[]) {
  db.$["select.where"].mockImplementation(async (where: unknown) =>
    renderQuery(where).sql.includes("_translation")
      ? await Promise.resolve(rows)
      : await Promise.resolve([])
  );
}

describe("listIndexableArticles", () => {
  test("reads the store's published articles, newest first", async () => {
    const { db } = setup();
    db.$["select.orderBy"].mockResolvedValue([
      {
        id: 9,
        priceAmount: 69_000,
        publishedAt: UPDATED_AT,
        slug: "anillo-sello",
        updatedAt: UPDATED_AT,
      },
      {
        id: 8,
        priceAmount: 129_000,
        publishedAt: UPDATED_AT,
        slug: "cadena",
        updatedAt: UPDATED_AT,
      },
    ]);
    answerTexts(db, [
      { locale: "es", productId: 9, title: "Anillo sello" },
      { locale: "en", productId: 9, title: "Signet ring" },
      { locale: "es", productId: 8, title: "Cadena" },
      // Another article's title never lands on these.
      { locale: "es", productId: 7, title: "Ajeno" },
    ]);

    await expect(
      listIndexableArticles(db as never, { storeId: STORE_ID })
    ).resolves.toEqual([
      {
        id: 9,
        priceAmount: 69_000,
        publishedAt: UPDATED_AT,
        slug: "anillo-sello",
        titles: [
          { locale: "es", title: "Anillo sello" },
          { locale: "en", title: "Signet ring" },
        ],
        updatedAt: UPDATED_AT,
      },
      {
        id: 8,
        priceAmount: 129_000,
        publishedAt: UPDATED_AT,
        slug: "cadena",
        titles: [{ locale: "es", title: "Cadena" }],
        updatedAt: UPDATED_AT,
      },
    ]);

    expect(db.$["select.from"].mock.calls).toEqual([
      [product],
      [productTranslation],
    ]);
    expect(
      db.$["select.innerJoin"].mock.calls.map(([joined, on]) => [
        joined,
        renderQuery(on),
      ])
    ).toEqual([
      [
        product,
        {
          params: [],
          sql: '"product"."id" = "product_translation"."productId"',
        },
      ],
    ]);
    // A draft never; the titles of an article unpublished since the first
    // read neither.
    expect(
      db.$["select.where"].mock.calls.map(([where]) => renderQuery(where))
    ).toEqual([
      {
        params: [STORE_ID, "published"],
        sql: '("product"."storeId" = $1 and "product"."status" = $2)',
      },
      {
        params: [9, 8, "published"],
        sql: '("product_translation"."productId" in ($1, $2) and "product"."status" = $3)',
      },
    ]);
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"product"."publishedAt" desc, "product"."id" desc'
    );
    expect(db.$.select.mock.calls[0]).toEqual([
      {
        id: product.id,
        priceAmount: product.priceAmount,
        publishedAt: product.publishedAt,
        slug: product.slug,
        updatedAt: product.updatedAt,
      },
    ]);
  });

  test("reads no titles for a store without published articles", async () => {
    const { db } = setup();

    await expect(
      listIndexableArticles(db as never, { storeId: STORE_ID })
    ).resolves.toEqual([]);
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(product);
  });
});

describe("listIndexableCategories", () => {
  test("reads the store's categories with a published article, in them or in a category of theirs, in their order, by name, at their pages", async () => {
    const { db } = setup();
    db.$["select.orderBy"].mockResolvedValue([
      { id: 1, parentSlug: "bijouterie", slug: "anillos" },
      { id: 2, parentSlug: null, slug: "aros" },
      { id: 3, parentSlug: null, slug: "sin-nombre" },
    ]);
    answerTexts(db, [
      { categoryId: 1, locale: "es", name: "Anillos" },
      { categoryId: 1, locale: "en", name: "Rings" },
      { categoryId: 2, locale: "es", name: "Aros" },
    ]);

    // In the asked language, else the one it has, else by its slug.
    await expect(
      listIndexableCategories(db as never, { locale: "en", storeId: STORE_ID })
    ).resolves.toEqual([
      { name: "Rings", path: "/bijouterie/anillos", slug: "anillos" },
      { name: "Aros", path: "/aros", slug: "aros" },
      { name: "sin-nombre", path: "/sin-nombre", slug: "sin-nombre" },
    ]);

    expect(db.$["select.from"].mock.calls).toEqual([
      [category],
      [categoryTranslation],
    ]);
    expect(db.$["select.innerJoin"]).not.toHaveBeenCalled();
    // Its group, of the same store, for its page's address.
    expect(renderQuery(db.$["select.leftJoin"].mock.calls[0]?.[1])).toEqual({
      params: [],
      sql: '("category_group"."id" = "category"."parentId" and "category_group"."storeId" = "category"."storeId")',
    });
    expect(
      db.$["select.where"].mock.calls.map(([where]) => renderQuery(where))
    ).toEqual([
      {
        params: [STORE_ID, "published"],
        sql:
          '("category"."storeId" = $1 and exists (select 1 from "product" where ' +
          '("product"."storeId" = "category"."storeId" and "product"."status" = $2 and ' +
          '("product"."categoryId" = "category"."id" or "product"."categoryId" in ' +
          '(select "category_child"."id" from "category" as "category_child" where "category_child"."parentId" = "category"."id")))))',
      },
      {
        params: [1, 2, 3],
        sql: '"category_translation"."categoryId" in ($1, $2, $3)',
      },
    ]);
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"category"."position" asc, "category"."id" asc'
    );
  });

  test("reads no names for a store without a category to list", async () => {
    const { db } = setup();

    await expect(
      listIndexableCategories(db as never, { locale: "es", storeId: STORE_ID })
    ).resolves.toEqual([]);
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(category);
  });
});
