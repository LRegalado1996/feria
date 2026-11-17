import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, test, vi } from "vitest";

import { createProductSchema } from "@/lib/schemas/catalog";
import {
  category,
  categoryTranslation,
  productImage,
  productImageTranslation,
  store,
  storeTranslation,
} from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import {
  SEED_ALL_ARTICLES_COVER,
  SEED_ARTICLES,
  SEED_CATEGORIES,
  SEED_COLORS,
  seedCatalog,
  seedCatalogPages,
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

  test("creates the launch categories in order, the Bijouterie group first, named in both languages", async () => {
    const { db, run } = setup();

    await expect(run()).resolves.toBe(11);
    const categoryRows = db.$.insert.mock.calls.flatMap(([table], index) =>
      table === category ? [db.$["insert.values"].mock.calls[index]?.[0]] : []
    );
    expect(categoryRows).toEqual([
      { position: 0, slug: "bijouterie", storeId: 7 },
      { position: 1, slug: "cadenas", storeId: 7 },
      { position: 2, slug: "anillos", storeId: 7 },
      { position: 3, slug: "aros", storeId: 7 },
      { position: 4, slug: "pulseras", storeId: 7 },
      { position: 5, slug: "burbujeros", storeId: 7 },
    ]);
    expect(db.$["insert.values"]).toHaveBeenCalledWith([
      { categoryId: 1, locale: "es", name: "Bijouterie" },
      { categoryId: 1, locale: "en", name: "Jewelry" },
    ]);
    expect(db.$["insert.values"]).toHaveBeenCalledWith([
      { categoryId: 6, locale: "es", name: "Burbujeros" },
      { categoryId: 6, locale: "en", name: "Bubble guns" },
    ]);
    expect(db.$.insert).toHaveBeenCalledWith(categoryTranslation);
  });

  test("every seeded cover is a photo in public/seed, and every group is listed before its categories", () => {
    const slugs = SEED_CATEGORIES.map((entry) => entry.slug);
    const files = [
      SEED_ALL_ARTICLES_COVER,
      ...SEED_CATEGORIES.map((entry) => entry.cover),
    ].flatMap((cover) =>
      [cover.computer, cover.phone].flatMap((image) =>
        image ? [image.file] : []
      )
    );

    // Eleven photos: seven computer images and four phone ones.
    expect(files).toHaveLength(11);
    expect(
      files.filter(
        (file) => !existsSync(path.join(process.cwd(), "public/seed", file))
      )
    ).toEqual([]);
    expect(
      SEED_CATEGORIES.flatMap((entry, index) =>
        entry.group && slugs.indexOf(entry.group) >= index ? [entry.slug] : []
      )
    ).toEqual([]);
    expect(
      SEED_CATEGORIES.filter((entry) => entry.group === "bijouterie").map(
        (entry) => entry.slug
      )
    ).toEqual(["cadenas", "anillos", "aros", "pulseras"]);
  });

  test("creates, illustrates and publishes every sample article in its category", async () => {
    const { db, run } = setup();

    await run();

    expect(createProduct).toHaveBeenCalledTimes(SEED_ARTICLES.length);
    expect(createProduct).toHaveBeenNthCalledWith(1, db, {
      storeId: 7,
      values: {
        categoryId: 6,
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
describe("seedCatalogPages", () => {
  /** A category's row as the step reads it: in no group, without a cover. */
  function makeRow(
    id: number,
    slug: string,
    overrides: { coverUrl?: string | null; parentId?: number | null } = {}
  ): {
    coverUrl: string | null;
    id: number;
    parentId: number | null;
    slug: string;
  } {
    return { coverUrl: null, id, parentId: null, slug, ...overrides };
  }

  /** A write's values as a plain record, to read its fields. */
  function fieldsOf(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null
      ? Object.fromEntries(Object.entries(value))
      : {};
  }

  /**
   * The store's categories before the step (`before`) and after it inserts
   * the group (`after`), and whether the store's cover is still empty.
   */
  function setupPages({
    after,
    before,
    storeCovered = false,
  }: {
    after?: ReturnType<typeof makeRow>[];
    before: ReturnType<typeof makeRow>[];
    storeCovered?: boolean;
  }) {
    const db = createMockDatabase();
    let reads = 0;
    db.$["select.where"].mockImplementation(async () => {
      reads += 1;
      return await Promise.resolve(reads === 1 ? before : (after ?? before));
    });
    db.$["insert.returning"].mockResolvedValue([{ id: 60 }]);
    db.$["update.returning"].mockResolvedValue(storeCovered ? [] : [{ id: 7 }]);
    /** Every UPDATE as its table, its values and its condition. */
    const updates = () =>
      db.$.update.mock.calls.map(([table], index) => ({
        set: fieldsOf(db.$["update.set"].mock.calls[index]?.[0]),
        table,
        where: renderQuery(db.$["update.where"].mock.calls[index]?.[0]),
      }));

    return {
      db,
      run: async () => await seedCatalogPages(db as never, 7),
      updates,
    };
  }

  const FLAT = [
    makeRow(1, "burbujeros"),
    makeRow(2, "cadenas"),
    makeRow(3, "anillos"),
    makeRow(4, "aros"),
    makeRow(5, "pulseras"),
  ];

  test("takes the store's category lock before it reads a category", async () => {
    const { db, run } = setupPages({ before: FLAT });

    await run();

    expect(renderQuery(db.$.execute.mock.calls[0]?.[0])).toEqual({
      params: ["category:7"],
      sql: "select pg_advisory_xact_lock(hashtext($1))",
    });
    expect(db.$.execute.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      db.$["select.where"].mock.invocationCallOrder[0] ?? 0
    );
  });

  test("gives a catalog seeded before groups its Bijouterie first, its four categories in it and every cover", async () => {
    const { db, run, updates } = setupPages({
      after: [...FLAT, makeRow(60, "bijouterie")],
      before: FLAT,
    });

    await expect(run()).resolves.toEqual({ covers: 7, grouped: 4, groups: 1 });

    // Every category moves one place down, then the group takes the first.
    expect(updates()[0]).toEqual({
      set: { position: expect.anything() },
      table: category,
      where: { params: [7], sql: '"category"."storeId" = $1' },
    });
    expect(renderQuery(updates()[0]?.set.position)).toEqual({
      params: [],
      sql: '"category"."position" + 1',
    });
    expect(db.$["insert.values"].mock.calls).toEqual([
      [{ position: 0, slug: "bijouterie", storeId: 7 }],
      [
        [
          { categoryId: 60, locale: "es", name: "Bijouterie" },
          { categoryId: 60, locale: "en", name: "Jewelry" },
        ],
      ],
    ]);
    expect(
      updates().filter((update) => update.set.parentId !== undefined)
    ).toEqual(
      [2, 3, 4, 5].map((id) => ({
        set: { parentId: 60 },
        table: category,
        where: {
          params: [id],
          sql: '("category"."id" = $1 and "category"."parentId" is null)',
        },
      }))
    );
    // Anillos' cover, filled only where it is still empty, and its alt texts.
    expect(updates()).toContainEqual({
      set: {
        coverHeight: 800,
        coverPhoneHeight: 1200,
        coverPhoneUrl: "/seed/ring-1.jpg",
        coverPhoneWidth: 1200,
        coverUrl: "/seed/ring-2.jpg",
        coverWidth: 1200,
      },
      table: category,
      where: {
        params: [3],
        sql: '("category"."id" = $1 and "category"."coverUrl" is null)',
      },
    });
    expect(updates()).toContainEqual({
      set: { coverAlt: "Anillo sello dorado" },
      table: categoryTranslation,
      where: {
        params: [3, "es"],
        sql: '("category_translation"."categoryId" = $1 and "category_translation"."locale" = $2 and "category_translation"."coverAlt" is null)',
      },
    });
    expect(updates()).toContainEqual({
      set: {
        catalogCoverHeight: 800,
        catalogCoverPhoneHeight: 1200,
        catalogCoverPhoneUrl: "/seed/earrings-1.jpg",
        catalogCoverPhoneWidth: 1200,
        catalogCoverUrl: "/seed/ring-3.jpg",
        catalogCoverWidth: 1200,
      },
      table: store,
      where: {
        params: [7],
        sql: '("store"."id" = $1 and "store"."catalogCoverUrl" is null)',
      },
    });
    expect(updates()).toContainEqual({
      set: { catalogCoverAlt: "Gold ring with pink stones" },
      table: storeTranslation,
      where: {
        params: [7, "en"],
        sql: '("store_translation"."storeId" = $1 and "store_translation"."locale" = $2 and "store_translation"."catalogCoverAlt" is null)',
      },
    });
  });

  test("leaves a catalog that has its group, its categories in it and its covers alone", async () => {
    const done = [
      makeRow(60, "bijouterie", { coverUrl: "/seed/a.jpg" }),
      ...FLAT.map((row) => ({
        ...row,
        coverUrl: "/seed/a.jpg",
        parentId: row.slug === "burbujeros" ? null : 60,
      })),
    ];
    const { db, run, updates } = setupPages({
      before: done,
      storeCovered: true,
    });

    await expect(run()).resolves.toEqual({ covers: 0, grouped: 0, groups: 0 });
    expect(db.$.insert).not.toHaveBeenCalled();
    // Only the store's guarded cover write, which changed nothing.
    expect(updates().map((update) => update.table)).toEqual([store]);
  });

  test.each([
    [
      "adds no group to a store that has none of its categories",
      [makeRow(1, "burbujeros", { coverUrl: "/seed/a.jpg" })],
    ],
    [
      "keeps a category that is a group itself out of the seeded group",
      [
        makeRow(60, "bijouterie", { coverUrl: "/seed/a.jpg" }),
        // The store's own group, named like a seeded category.
        makeRow(9, "cadenas", { coverUrl: "/seed/a.jpg" }),
        makeRow(10, "collares", { coverUrl: "/seed/a.jpg", parentId: 9 }),
      ],
    ],
    [
      "puts nothing in a Bijouterie that is in a group itself: three levels are never made",
      [
        makeRow(70, "accesorios", { coverUrl: "/seed/a.jpg" }),
        makeRow(60, "bijouterie", { coverUrl: "/seed/a.jpg", parentId: 70 }),
        makeRow(3, "anillos", { coverUrl: "/seed/a.jpg" }),
      ],
    ],
  ])("%s", async (_case, before) => {
    const { db, run, updates } = setupPages({ before, storeCovered: true });

    await expect(run()).resolves.toEqual({ covers: 0, grouped: 0, groups: 0 });
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(updates().map((update) => update.table)).toEqual([store]);
  });

  test("fails loudly when the group's insert returns no row", async () => {
    const { db, run } = setupPages({ before: FLAT });
    db.$["insert.returning"].mockResolvedValue([]);

    await expect(run()).rejects.toThrow("Inserting a category returned no row");
  });
});
