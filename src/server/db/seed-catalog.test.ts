import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, test, vi } from "vitest";

import { createProductSchema } from "@/lib/schemas/catalog";
import {
  category,
  categoryTranslation,
  productImage,
  productImageTranslation,
} from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { SEED_ARTICLES, SEED_CATEGORIES, seedCatalog } from "./seed-catalog";

const { createProduct, publishProduct } = vi.hoisted(() => ({
  createProduct: vi.fn(),
  publishProduct: vi.fn(async (_tx: unknown, input: { id: number }) => ({
    id: input.id,
    slug: "x",
    status: "published" as const,
  })),
}));

vi.mock("@/server/services/catalog", () => ({ createProduct, publishProduct }));

function setup({ hasCategories = false } = {}) {
  const db = createMockDatabase();
  // Article ids count up from 101 in each test.
  let articleId = 100;
  createProduct.mockImplementation(async () => {
    articleId += 1;
    return { id: articleId, slug: `article-${articleId}`, status: "draft" };
  });
  db.query.category.findFirst.mockResolvedValue(
    hasCategories ? { id: 1 } : undefined
  );
  let id = 0;
  db.$["insert.returning"].mockImplementation(async () => {
    id += 1;
    return [{ id }];
  });

  return { db, run: async () => await seedCatalog(db as never, 7) };
}

describe("seedCatalog", () => {
  test("leaves a store that already has categories alone", async () => {
    const { db, run } = setup({ hasCategories: true });

    await expect(run()).resolves.toBe(0);
    const [config] = db.query.category.findFirst.mock.calls[0] ?? [];
    expect(renderQuery((config as { where: unknown }).where)).toEqual({
      params: [7],
      sql: '"category"."storeId" = $1',
    });
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(createProduct).not.toHaveBeenCalled();
  });

  test("creates the five launch categories in order, named in both languages", async () => {
    const { db, run } = setup();

    await expect(run()).resolves.toBe(11);
    const categoryRows = db.$.insert.mock.calls.flatMap(([table], index) =>
      table === category ? [db.$["insert.values"].mock.calls[index]?.[0]] : []
    );
    expect(categoryRows).toEqual([
      { position: 0, slug: "burbujeros", storeId: 7 },
      { position: 1, slug: "cadenas", storeId: 7 },
      { position: 2, slug: "anillos", storeId: 7 },
      { position: 3, slug: "aros", storeId: 7 },
      { position: 4, slug: "pulseras", storeId: 7 },
    ]);
    expect(db.$["insert.values"]).toHaveBeenCalledWith([
      { categoryId: 1, locale: "es", name: "Burbujeros" },
      { categoryId: 1, locale: "en", name: "Bubble guns" },
    ]);
    expect(db.$.insert).toHaveBeenCalledWith(categoryTranslation);
  });

  test("creates, illustrates and publishes every sample article in its category", async () => {
    const { db, run } = setup();

    await run();

    expect(createProduct).toHaveBeenCalledTimes(SEED_ARTICLES.length);
    expect(createProduct).toHaveBeenNthCalledWith(1, db, {
      storeId: 7,
      values: {
        categoryId: 1,
        isAvailable: true,
        priceAmount: 69_000,
        translations: [
          expect.objectContaining({ locale: "es", title: "Burbujero cristal" }),
          expect.objectContaining({
            locale: "en",
            title: "Crystal bubble gun",
          }),
        ],
      },
    });
    expect(db.$["insert.values"]).toHaveBeenCalledWith({
      height: 899,
      position: 0,
      productId: 101,
      url: "/seed/bubble-gun-1.jpg",
      width: 1199,
    });
    expect(db.$.insert).toHaveBeenCalledWith(productImage);
    expect(db.$.insert).toHaveBeenCalledWith(productImageTranslation);
    expect(publishProduct).toHaveBeenNthCalledWith(1, db, {
      id: 101,
      storeId: 7,
    });
    expect(publishProduct).toHaveBeenCalledTimes(SEED_ARTICLES.length);
  });

  test("fails loudly when a category insert returns no row", async () => {
    const { db, run } = setup();
    db.$["insert.returning"].mockResolvedValue([]);

    await expect(run()).rejects.toThrow("Inserting a category returned no row");
  });

  test("fails loudly when an image insert returns no row", async () => {
    const { db, run } = setup();
    let calls = 0;
    db.$["insert.returning"].mockImplementation(async () => {
      calls += 1;
      return calls <= SEED_CATEGORIES.length ? [{ id: calls }] : [];
    });

    await expect(run()).rejects.toThrow("Inserting an image returned no row");
  });

  test("every sample article passes the API's rules and has its photo in public/seed", () => {
    const slugs = new Set(
      SEED_CATEGORIES.map((seedCategory) => seedCategory.slug)
    );

    for (const article of SEED_ARTICLES) {
      expect(slugs.has(article.category)).toBe(true);
      expect(
        createProductSchema.safeParse({
          categoryId: 1,
          isAvailable: article.isAvailable,
          priceAmount: article.priceAmount,
          storeSlug: "lr-market",
          translations: (["es", "en"] as const).map((locale) => ({
            description: article.description[locale],
            locale,
            seoDescription: null,
            seoTitle: null,
            title: article.title[locale],
          })),
        }).success
      ).toBe(true);
      expect(
        existsSync(path.join(process.cwd(), "public/seed", article.image.file))
      ).toBe(true);
    }

    expect(
      SEED_ARTICLES.filter((article) => !article.isAvailable)
    ).toHaveLength(1);
  });
});
