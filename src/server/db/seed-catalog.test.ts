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

import {
  SEED_ARTICLES,
  SEED_CATEGORIES,
  SEED_COLORS,
  seedCatalog,
} from "./seed-catalog";

const { createProduct, publishProduct } = vi.hoisted(() => ({
  createProduct: vi.fn(),
  publishProduct: vi.fn(async (_tx: unknown, input: { id: number }) => ({
    id: input.id,
    slug: "x",
    status: "published" as const,
  })),
}));

vi.mock("@/server/services/catalog", () => ({ createProduct, publishProduct }));

// The filter's own queries are `src/server/services/attribute.test.ts`'s:
// here the seed only has to call them with the right values, in order.
const { createAttribute, createAttributeValue, setProductAttributeValues } =
  vi.hoisted(() => ({
    createAttribute: vi.fn(async () => ({
      id: 50,
      position: 0,
      slug: "color",
    })),
    createAttributeValue: vi.fn(),
    setProductAttributeValues: vi.fn(
      async (
        _tx: unknown,
        input: { productId: number; valueIds: number[] }
      ) => ({
        id: input.productId,
        valueIds: input.valueIds,
      })
    ),
  }));

vi.mock("@/server/services/attribute", () => ({
  createAttribute,
  createAttributeValue,
  setProductAttributeValues,
}));

function setup({ hasCategories = false } = {}) {
  const db = createMockDatabase();
  // Article ids count up from 101 in each test.
  let articleId = 100;
  createProduct.mockImplementation(async () => {
    articleId += 1;
    return { id: articleId, slug: `article-${articleId}`, status: "draft" };
  });
  // Color value ids count up from 201 in each test, in SEED_COLORS' order.
  let valueId = 200;
  createAttributeValue.mockImplementation(async () => {
    valueId += 1;
    return { id: valueId, position: valueId - 201, slug: `value-${valueId}` };
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
    expect(createAttribute).not.toHaveBeenCalled();
  });

  test("creates the Color filter, then its nine values in order with their swatches", async () => {
    const { db, run } = setup();

    await run();

    expect(createAttribute).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: 7,
      values: { nameEn: "Color", nameEs: "Color" },
    });
    expect(createAttributeValue.mock.calls).toEqual(
      [
        ["Dorado", "Gold", "#d4af37"],
        ["Plateado", "Silver", "#c0c0c0"],
        ["Oro rosa", "Rose gold", "#b76e79"],
        ["Negro", "Black", "#111111"],
        ["Blanco", "White", "#ffffff"],
        ["Violeta", "Purple", "#8e44ad"],
        ["Rojo", "Red", "#c0392b"],
        ["Verde", "Green", "#27ae60"],
        ["Azul", "Blue", "#2980b9"],
      ].map(([nameEs, nameEn, swatchColor]) => [
        db,
        {
          attributeId: 50,
          storeId: 7,
          swatchColor,
          values: { nameEn, nameEs },
        },
      ])
    );
    // The filter exists before its first value.
    expect(createAttribute.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      createAttributeValue.mock.invocationCallOrder[0] ?? 0
    );
  });

  test("gives each published article the ids of its colors", async () => {
    const { db, run } = setup();

    await run();

    // Values 201… are SEED_COLORS' order: dorado 201, plateado 202,
    // oro-rosa 203, blanco 205, azul 209.
    expect(setProductAttributeValues.mock.calls).toEqual(
      (
        [
          [101, [209]],
          [102, [202]],
          [103, [202]],
          [104, [201]],
          [105, [201]],
          [106, [201]],
          [107, [201, 203]],
          [108, [201]],
          [109, [202, 205]],
          [110, [201]],
          [111, [201]],
        ] as const
      ).map(([productId, valueIds]) => [
        db,
        { productId, storeId: 7, valueIds },
      ])
    );
    // An article is published before its colors are set.
    expect(publishProduct.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      setProductAttributeValues.mock.invocationCallOrder[0] ?? 0
    );
  });

  test("every sample article's colors are seeded colors", () => {
    const colors = new Set(SEED_COLORS.map((color) => color.slug));

    for (const article of SEED_ARTICLES) {
      expect(article.colors.length).toBeGreaterThan(0);
      expect(article.colors.filter((slug) => !colors.has(slug))).toEqual([]);
    }
  });

  test.each(["es", "en"] as const)(
    "every sample article's %s description is two paragraphs of two or three sentences in all",
    (locale) => {
      for (const article of SEED_ARTICLES) {
        const text = article.description[locale];
        const paragraphs = text.split("\n\n");
        const sentences = text.match(/[.!?](?=\s|$)/gu) ?? [];

        expect(paragraphs).toHaveLength(2);
        // Each one written and already trimmed: a trailing blank line would
        // make an empty second paragraph.
        expect(
          paragraphs.filter(
            (paragraph) => paragraph === "" || paragraph.trim() !== paragraph
          )
        ).toEqual([]);
        expect(sentences.length).toBeGreaterThanOrEqual(2);
        expect(sentences.length).toBeLessThanOrEqual(3);
      }
    }
  );

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
