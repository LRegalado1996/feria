import { describe, expect, test } from "vitest";

import {
  category,
  categoryTranslation,
  product,
  productTranslation,
  store,
} from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderOrderBy, renderQuery } from "@/server/test/render-sql";

import {
  listIndexableArticles,
  listIndexableCategories,
  listIndexableStores,
} from "./seo";

const STORE_ID = 3;
const UPDATED_AT = new Date("2026-11-14T12:00:00.000Z");

/** The `columns`, `where`, `orderBy` and `with` a relational read was given. */
interface ReadConfig {
  columns: Record<string, boolean>;
  orderBy: unknown;
  where: unknown;
  with: unknown;
}

function setup() {
  const db = createMockDatabase();

  return {
    configOf: (fn: (typeof db.query)["store"]["findMany"]) =>
      fn.mock.calls[0]?.[0] as ReadConfig,
    db,
  };
}

describe("listIndexableStores", () => {
  test("reads only active stores, oldest first, with their texts", async () => {
    const { configOf, db } = setup();
    const rows = [
      {
        currencyCode: "UYU",
        id: 1,
        name: "LR Market",
        slug: "lr-market",
        translations: [],
        updatedAt: UPDATED_AT,
      },
    ];
    db.query.store.findMany.mockResolvedValue(rows);

    await expect(listIndexableStores(db as never)).resolves.toBe(rows);

    const config = configOf(db.query.store.findMany);
    expect(renderQuery(config.where)).toEqual({
      params: [true],
      sql: '"store"."isActive" = $1',
    });
    expect(renderOrderBy(config.orderBy)).toBe('"store"."id" asc');
    expect(config.columns).toEqual({
      currencyCode: true,
      id: true,
      name: true,
      slug: true,
      updatedAt: true,
    });
    expect(config.with).toEqual({
      translations: {
        columns: { description: true, locale: true, tagline: true },
      },
    });
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
  test("reads the store's published articles of an active store, newest first", async () => {
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
    const [joined, on] = db.$["select.innerJoin"].mock.calls[0] ?? [];
    expect(joined).toBe(store);
    expect(renderQuery(on)).toEqual({
      params: [],
      sql: '"store"."id" = "product"."storeId"',
    });
    // A draft never, and nothing of an inactive store even by its id.
    expect(
      db.$["select.where"].mock.calls.map(([where]) => renderQuery(where))
    ).toEqual([
      {
        params: [STORE_ID, "published", true],
        sql: '("product"."storeId" = $1 and "product"."status" = $2 and "store"."isActive" = $3)',
      },
      { params: [9, 8], sql: '"product_translation"."productId" in ($1, $2)' },
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
  test("reads the store's categories with a published article, in their order, by name", async () => {
    const { db } = setup();
    db.$["select.orderBy"].mockResolvedValue([
      { id: 1, slug: "anillos" },
      { id: 2, slug: "aros" },
      { id: 3, slug: "sin-nombre" },
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
      { name: "Rings", slug: "anillos" },
      { name: "Aros", slug: "aros" },
      { name: "sin-nombre", slug: "sin-nombre" },
    ]);

    expect(db.$["select.from"].mock.calls).toEqual([
      [category],
      [categoryTranslation],
    ]);
    expect(
      db.$["select.where"].mock.calls.map(([where]) => renderQuery(where))
    ).toEqual([
      {
        params: [STORE_ID, "published"],
        sql:
          '("category"."storeId" = $1 and exists (select 1 from "product" where ' +
          '("product"."categoryId" = "category"."id" and "product"."storeId" = "category"."storeId" and "product"."status" = $2)))',
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
