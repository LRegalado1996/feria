import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import {
  category,
  product,
  productImage,
  productTranslation,
} from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import {
  renderOrderBy,
  renderQuery,
  renderSql,
} from "@/server/test/render-sql";

import {
  createProduct,
  deleteProduct,
  getPublishedProduct,
  getPublishedProductRef,
  listCategories,
  listPublishedProducts,
  listRelatedProducts,
  publishProduct,
  reorderProductImages,
  resolvePublishGaps,
  setProductAvailability,
  unpublishProduct,
  updateProduct,
} from "./catalog";

const STORE_ID = 3;
const PUBLISHED_AT = new Date("2026-11-10T12:00:00.123Z");

/** The `where`, `orderBy` and `columns` a relational read was handed. */
interface ReadConfig {
  columns?: Record<string, boolean>;
  orderBy?: unknown;
  where: unknown;
}

function setup() {
  const db = createMockDatabase();

  return {
    db,
    /** The nth call's config of a relational read. */
    configOf: (
      fn: (typeof db.query)["product"]["findMany"],
      call = 0
    ): ReadConfig => fn.mock.calls[call]?.[0] as ReadConfig,
    /**
     * Answers the row-locking reads (`.for(...)`) by the `where` they lock:
     * the store's category (found unless `category` is false, under a share
     * lock) or the article locked to be written (`locked`).
     */
    answerLocks: (
      locked: unknown[] = [],
      { category: found = true }: { category?: boolean } = {}
    ) => {
      db.$["select.for"].mockImplementation(async () => {
        const text = renderSql(db.$["select.where"].mock.calls.at(-1)?.[0]);

        if (text.startsWith('("category"."id" = $1')) {
          return await Promise.resolve(found ? [{ id: 9 }] : []);
        }

        return await Promise.resolve(locked);
      });
    },
    /**
     * Answers plain selects that end in `.where` by the table they filter:
     * the image count, the article's images, or the taken slugs.
     */
    answerWhere: ({
      images = [],
      imageTotal = 0,
      takenSlugs = [],
    }: {
      images?: { id: number }[];
      imageTotal?: number;
      takenSlugs?: string[];
    }) => {
      db.$["select.where"].mockImplementation(async (where: unknown) => {
        const text = renderSql(where);

        if (text.startsWith('"product_image"."productId" = $1')) {
          return await Promise.resolve(
            images.length > 0 ? images : [{ total: imageTotal }]
          );
        }

        return await Promise.resolve(takenSlugs.map((slug) => ({ slug })));
      });
    },
  };
}

function translationInput(
  overrides: Partial<{
    description: string;
    locale: Locale;
    seoDescription: string | null;
    seoTitle: string | null;
    title: string;
  }> = {}
) {
  return {
    description: "Hecho a mano",
    locale: "es" as const,
    seoDescription: null,
    seoTitle: null,
    title: "Collar Dorado",
    ...overrides,
  };
}

function productValues(
  overrides: Partial<{
    categoryId: number | null;
    isAvailable: boolean;
    priceAmount: number | null;
    translations: ReturnType<typeof translationInput>[];
  }> = {}
) {
  return {
    categoryId: 9,
    isAvailable: true,
    priceAmount: 1500,
    translations: [translationInput()],
    ...overrides,
  };
}

function lockedRow(
  overrides: Partial<{
    categoryId: number | null;
    priceAmount: number | null;
    publishedAt: Date | null;
    status: "draft" | "published";
  }> = {}
) {
  return {
    categoryId: 9,
    id: 7,
    priceAmount: 1500,
    publishedAt: null,
    slug: "collar-viejo",
    status: "draft" as const,
    ...overrides,
  };
}

function cardRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    category: { slug: "collares" },
    id,
    images: [
      {
        height: 600,
        id: id * 10,
        translations: [{ altText: `Foto ${id}`, locale: "es" }],
        url: `https://cdn.example.com/${id}.jpg`,
        width: 800,
      },
    ],
    isAvailable: true,
    priceAmount: 1500,
    publishedAt: PUBLISHED_AT,
    slug: `articulo-${id}`,
    translations: [{ locale: "es", title: `Artículo ${id}` }],
    ...overrides,
  };
}

function card(id: number, overrides: Record<string, unknown> = {}) {
  return {
    categorySlug: "collares",
    cover: {
      alt: `Foto ${id}`,
      height: 600,
      url: `https://cdn.example.com/${id}.jpg`,
      width: 800,
    },
    currencyCode: "UYU",
    id,
    isAvailable: true,
    lang: "es",
    priceAmount: 1500,
    slug: `articulo-${id}`,
    title: `Artículo ${id}`,
    ...overrides,
  };
}

describe("listCategories", () => {
  test("names each category in the asked language, or the one it has, with its lang", async () => {
    const { configOf, db } = setup();
    db.query.category.findMany.mockResolvedValue([
      {
        id: 1,
        position: 0,
        slug: "collares",
        translations: [
          { locale: "es", name: "Collares" },
          { locale: "en", name: "Necklaces" },
        ],
      },
      {
        id: 2,
        position: 1,
        slug: "aros",
        translations: [{ locale: "es", name: "Aros" }],
      },
      { id: 3, position: 2, slug: "sin-nombre", translations: [] },
    ]);

    await expect(
      listCategories(db as never, { locale: "en", storeId: STORE_ID })
    ).resolves.toEqual([
      { id: 1, lang: "en", name: "Necklaces", position: 0, slug: "collares" },
      { id: 2, lang: "es", name: "Aros", position: 1, slug: "aros" },
      { id: 3, lang: "en", name: "", position: 2, slug: "sin-nombre" },
    ]);
    const config = configOf(db.query.category.findMany);
    expect(renderQuery(config.where)).toEqual({
      params: [STORE_ID],
      sql: '"category"."storeId" = $1',
    });
    expect(renderOrderBy(config.orderBy)).toBe(
      '"category"."position" asc, "category"."id" asc'
    );
  });
});

describe("listPublishedProducts", () => {
  async function list(
    db: ReturnType<typeof setup>["db"],
    overrides: Partial<Parameters<typeof listPublishedProducts>[1]> = {}
  ) {
    return await listPublishedProducts(db as never, {
      currencyCode: "UYU",
      limit: 2,
      locale: "es",
      storeId: STORE_ID,
      ...overrides,
    });
  }

  test("filters by the store and the published status, newest first, asking one row past the page", async () => {
    const { db } = setup();

    await expect(list(db)).resolves.toEqual({ items: [], nextCursor: null });
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, "published"],
      sql: '("product"."storeId" = $1 and "product"."status" = $2)',
    });
    const [joined, on] = db.$["select.leftJoin"].mock.calls[0] ?? [];
    expect(joined).toBe(category);
    expect(renderQuery(on)).toEqual({
      params: [STORE_ID],
      sql: '("category"."id" = "product"."categoryId" and "category"."storeId" = $1)',
    });
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(product);
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"product"."publishedAt" desc, "product"."id" desc'
    );
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(3);
    // An empty page asks no card query.
    expect(db.query.product.findMany).not.toHaveBeenCalled();
  });

  test("narrows by category slug, escaped search and the cursor", async () => {
    const { db } = setup();

    await list(db, {
      category: "collares",
      cursor: { id: 40, publishedAt: "2026-11-01T00:00:00.000Z" },
      locale: "en",
      q: String.raw`50%_off\x`,
    });

    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [
        STORE_ID,
        "published",
        "collares",
        "en",
        "es",
        "en",
        String.raw`%50\%\_off\\x%`,
        String.raw`%50\%\_off\\x%`,
        "2026-11-01T00:00:00.000Z",
        40,
      ],
      sql:
        '("product"."storeId" = $1 and "product"."status" = $2 and "category"."slug" = $3 and ' +
        'exists (select 1 from "product_translation" as "shown" where ("shown"."productId" = "product"."id" and ' +
        '("shown"."locale" = $4 or ("shown"."locale" = $5 and not exists (select 1 from "product_translation" as "own" ' +
        'where ("own"."productId" = "product"."id" and "own"."locale" = $6)))) and ' +
        '(unaccent("shown"."title") ilike unaccent($7) or unaccent("shown"."description") ilike unaccent($8)))) and ' +
        '("product"."publishedAt", "product"."id") < ($9::timestamptz, $10::int))',
    });
  });

  test("returns a full page with no cursor when no row follows it", async () => {
    const { configOf, db } = setup();
    db.$["select.limit"].mockResolvedValue([
      { id: 5, publishedAt: PUBLISHED_AT },
      { id: 4, publishedAt: PUBLISHED_AT },
    ]);
    db.query.product.findMany.mockResolvedValue([cardRow(4), cardRow(5)]);

    await expect(list(db)).resolves.toEqual({
      items: [card(5), card(4)],
      nextCursor: null,
    });
    expect(renderQuery(configOf(db.query.product.findMany).where)).toEqual({
      params: [5, 4, "published"],
      sql: '("product"."id" in ($1, $2) and "product"."status" = $3)',
    });
  });

  test("points the cursor at the page's last row when one more follows", async () => {
    const { configOf, db } = setup();
    db.$["select.limit"].mockResolvedValue([
      { id: 5, publishedAt: PUBLISHED_AT },
      { id: 4, publishedAt: new Date("2026-11-09T08:00:00.000Z") },
      { id: 3, publishedAt: new Date("2026-11-08T08:00:00.000Z") },
    ]);
    db.query.product.findMany.mockResolvedValue([cardRow(5), cardRow(4)]);

    await expect(list(db)).resolves.toEqual({
      items: [card(5), card(4)],
      nextCursor: { id: 4, publishedAt: "2026-11-09T08:00:00.000Z" },
    });
    expect(
      renderQuery(configOf(db.query.product.findMany).where).params
    ).toEqual([5, 4, "published"]);
  });

  test("builds cards with their fallbacks and skips an id the card query lost", async () => {
    const { db } = setup();
    db.$["select.limit"].mockResolvedValue([
      { id: 6, publishedAt: PUBLISHED_AT },
      { id: 5, publishedAt: PUBLISHED_AT },
    ]);
    db.query.product.findMany.mockResolvedValue([
      cardRow(5, {
        category: null,
        images: [],
        priceAmount: null,
        translations: [],
      }),
    ]);

    await expect(list(db, { locale: "en" })).resolves.toEqual({
      items: [
        card(5, {
          categorySlug: null,
          cover: null,
          lang: "en",
          priceAmount: 0,
          title: "",
        }),
      ],
      nextCursor: null,
    });
  });

  test("gives a cover without alt text the title, or nothing without one", async () => {
    const { db } = setup();
    const cover = {
      height: 600,
      id: 50,
      translations: [],
      url: "u",
      width: 800,
    };
    db.$["select.limit"].mockResolvedValue([
      { id: 5, publishedAt: PUBLISHED_AT },
      { id: 4, publishedAt: PUBLISHED_AT },
    ]);
    db.query.product.findMany.mockResolvedValue([
      cardRow(5, { images: [cover] }),
      cardRow(4, { images: [cover], translations: [] }),
    ]);

    const { items } = await list(db);

    expect(items.map((item) => item.cover?.alt)).toEqual(["Artículo 5", ""]);
  });
});

describe("getPublishedProduct", () => {
  async function get(
    db: ReturnType<typeof setup>["db"],
    locale: Locale = "en"
  ) {
    return await getPublishedProduct(db as never, {
      currencyCode: "USD",
      locale,
      slug: "collar-dorado",
      storeId: STORE_ID,
    });
  }

  function detailRow(overrides: Record<string, unknown> = {}) {
    return {
      category: {
        slug: "collares",
        translations: [
          { locale: "es", name: "Collares" },
          { locale: "en", name: "Necklaces" },
        ],
      },
      categoryId: 9,
      id: 7,
      images: [
        {
          height: 600,
          id: 70,
          translations: [{ altText: "Gold necklace", locale: "en" }],
          url: "https://cdn.example.com/70.jpg",
          width: 800,
        },
        {
          height: 300,
          id: 71,
          translations: [],
          url: "https://cdn.example.com/71.jpg",
          width: 400,
        },
      ],
      isAvailable: false,
      priceAmount: 2500,
      publishedAt: PUBLISHED_AT,
      slug: "collar-dorado",
      translations: [
        {
          description: "Hecho a mano",
          locale: "es",
          seoDescription: null,
          seoTitle: null,
          title: "Collar Dorado",
        },
        {
          description: "Handmade",
          locale: "en",
          seoDescription: "A gold necklace",
          seoTitle: "Gold necklace",
          title: "Golden Necklace",
        },
      ],
      ...overrides,
    };
  }

  test("answers NOT_FOUND for a slug no published article of the store has", async () => {
    const { configOf, db } = setup();

    await expect(get(db)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Article not found",
    });
    expect(renderQuery(configOf(db.query.product.findFirst).where)).toEqual({
      params: [STORE_ID, "collar-dorado", "published"],
      sql: '("product"."storeId" = $1 and "product"."slug" = $2 and "product"."status" = $3)',
    });
  });

  test("maps the article in the asked language, the title standing in for a missing alt", async () => {
    const { db } = setup();
    db.query.product.findFirst.mockResolvedValue(detailRow());

    await expect(get(db)).resolves.toEqual({
      category: { name: "Necklaces", slug: "collares" },
      categoryId: 9,
      currencyCode: "USD",
      description: "Handmade",
      id: 7,
      images: [
        {
          alt: "Gold necklace",
          height: 600,
          id: 70,
          url: "https://cdn.example.com/70.jpg",
          width: 800,
        },
        {
          alt: "Golden Necklace",
          height: 300,
          id: 71,
          url: "https://cdn.example.com/71.jpg",
          width: 400,
        },
      ],
      isAvailable: false,
      lang: "en",
      priceAmount: 2500,
      publishedAt: PUBLISHED_AT,
      seoDescription: "A gold necklace",
      seoTitle: "Gold necklace",
      slug: "collar-dorado",
      title: "Golden Necklace",
    });
  });

  test("falls back to empty text without category, price or translations", async () => {
    const { db } = setup();
    db.query.product.findFirst.mockResolvedValue(
      detailRow({
        category: null,
        categoryId: null,
        images: [{ height: 1, id: 70, translations: [], url: "u", width: 1 }],
        priceAmount: null,
        translations: [],
      })
    );

    await expect(get(db, "es")).resolves.toMatchObject({
      category: null,
      categoryId: null,
      description: "",
      images: [{ alt: "", height: 1, id: 70, url: "u", width: 1 }],
      lang: "es",
      priceAmount: 0,
      seoDescription: null,
      seoTitle: null,
      title: "",
    });
  });

  test("names a category without a name as empty", async () => {
    const { db } = setup();
    db.query.product.findFirst.mockResolvedValue(
      detailRow({ category: { slug: "collares", translations: [] } })
    );

    await expect(get(db)).resolves.toMatchObject({
      category: { name: "", slug: "collares" },
    });
  });
});

describe("listRelatedProducts", () => {
  async function related(
    db: ReturnType<typeof setup>["db"],
    categoryId: number | null
  ) {
    return await listRelatedProducts(db as never, {
      categoryId,
      currencyCode: "UYU",
      limit: 4,
      locale: "es",
      productId: 7,
      storeId: STORE_ID,
    });
  }

  test("has none for an article without a category, asking nothing", async () => {
    const { db } = setup();

    await expect(related(db, null)).resolves.toEqual([]);
    expect(db.$.select).not.toHaveBeenCalled();
  });

  test("lists the category's other published articles, newest first", async () => {
    const { db } = setup();
    db.$["select.limit"].mockResolvedValue([{ id: 5 }]);
    db.query.product.findMany.mockResolvedValue([cardRow(5)]);

    await expect(related(db, 9)).resolves.toEqual([card(5)]);
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, 9, "published", 7],
      sql: '("product"."storeId" = $1 and "product"."categoryId" = $2 and "product"."status" = $3 and "product"."id" <> $4)',
    });
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"product"."publishedAt" desc, "product"."id" desc'
    );
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(4);
  });
});

describe("resolvePublishGaps", () => {
  const ready = {
    categoryId: 9,
    imageCount: 1,
    priceAmount: 0,
    translations: [{ locale: "es" as const, title: "Collar" }],
  };

  test.each([
    ["nothing for a ready article", {}, []],
    ["the image", { imageCount: 0 }, ["image"]],
    ["the category", { categoryId: null }, ["category"]],
    ["the price", { priceAmount: null }, ["price"]],
    [
      "the Spanish title when only English has one",
      { translations: [{ locale: "en" as const, title: "Necklace" }] },
      ["spanishTitle"],
    ],
    [
      "the Spanish title when it is only spaces",
      { translations: [{ locale: "es" as const, title: "   " }] },
      ["spanishTitle"],
    ],
    [
      "everything, in order",
      { categoryId: null, imageCount: 0, priceAmount: null, translations: [] },
      ["image", "category", "price", "spanishTitle"],
    ],
  ])("names %s", (_name, overrides, expected) => {
    expect(resolvePublishGaps({ ...ready, ...overrides })).toEqual(expected);
  });
});

describe("createProduct", () => {
  async function create(
    db: ReturnType<typeof setup>["db"],
    values = productValues()
  ) {
    return await createProduct(db as never, { storeId: STORE_ID, values });
  }

  test("refuses a category of another store before inserting anything", async () => {
    const { answerLocks, db } = setup();
    answerLocks([], { category: false });

    await expect(create(db)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Category not found",
    });
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(category);
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [9, STORE_ID],
      sql: '("category"."id" = $1 and "category"."storeId" = $2)',
    });
    // Shared: the category cannot be deleted under the new article.
    expect(db.$["select.for"]).toHaveBeenCalledExactlyOnceWith("share");
    expect(db.$.execute).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("inserts a draft under the store's slug lock, its slug past the taken ones, then its texts", async () => {
    const { answerLocks, answerWhere, db } = setup();
    answerLocks();
    answerWhere({ takenSlugs: ["collar-dorado", "collar-dorado-2"] });
    const created = { id: 7, slug: "collar-dorado-3", status: "draft" };
    db.$["insert.returning"].mockResolvedValue([created]);
    const english = translationInput({
      description: "Handmade",
      locale: "en",
      seoDescription: "Gold",
      seoTitle: "Necklace",
      title: "Gold Necklace",
    });

    await expect(
      create(db, productValues({ translations: [english, translationInput()] }))
    ).resolves.toBe(created);
    expect(renderQuery(db.$.execute.mock.calls[0]?.[0])).toEqual({
      params: [`product.slug:${STORE_ID}`],
      sql: "select pg_advisory_xact_lock(hashtext($1))",
    });
    expect(renderQuery(db.$["select.where"].mock.calls[1]?.[0])).toEqual({
      params: [STORE_ID, "collar-dorado%"],
      sql: '("product"."storeId" = $1 and "product"."slug" like $2)',
    });
    expect(db.$.insert.mock.calls).toEqual([[product], [productTranslation]]);
    expect(db.$["insert.values"].mock.calls).toEqual([
      [
        {
          categoryId: 9,
          isAvailable: true,
          priceAmount: 1500,
          slug: "collar-dorado-3",
          status: "draft",
          storeId: STORE_ID,
        },
      ],
      [
        [
          {
            description: "Handmade",
            locale: "en",
            productId: 7,
            seoDescription: "Gold",
            seoTitle: "Necklace",
            title: "Gold Necklace",
          },
          {
            description: "Hecho a mano",
            locale: "es",
            productId: 7,
            seoDescription: null,
            seoTitle: null,
            title: "Collar Dorado",
          },
        ],
      ],
    ]);
  });

  test("names an unreadable title by the fallback and checks no category when none is given", async () => {
    const { db } = setup();
    db.$["insert.returning"].mockResolvedValue([
      { id: 8, slug: "articulo", status: "draft" },
    ]);

    await create(
      db,
      productValues({
        categoryId: null,
        translations: [translationInput({ title: "¡¡¡" })],
      })
    );

    expect(db.query.category.findFirst).not.toHaveBeenCalled();
    expect(db.$["insert.values"].mock.calls[0]?.[0]).toMatchObject({
      categoryId: null,
      slug: "articulo",
    });
  });

  test("fails loudly when the insert returns no row, inserting no texts", async () => {
    const { answerLocks, db } = setup();
    answerLocks();

    await expect(create(db)).rejects.toThrow(
      "Inserting an article returned no row"
    );
    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(product);
  });
});

describe("updateProduct", () => {
  async function update(
    db: ReturnType<typeof setup>["db"],
    values = productValues()
  ) {
    return await updateProduct(db as never, {
      storeId: STORE_ID,
      values: { id: 7, ...values },
    });
  }

  test("answers NOT_FOUND when the store has no such article, writing nothing", async () => {
    const { db } = setup();

    await expect(update(db)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Article not found",
    });
    expect(db.$["select.for"]).toHaveBeenCalledExactlyOnceWith("update");
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [7, STORE_ID],
      sql: '("product"."id" = $1 and "product"."storeId" = $2)',
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("refuses to take the price off a published article", async () => {
    const { answerLocks, answerWhere, db } = setup();
    answerLocks([
      lockedRow({ publishedAt: PUBLISHED_AT, status: "published" }),
    ]);
    answerWhere({ imageTotal: 2 });

    await expect(
      update(db, productValues({ priceAmount: null }))
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The article cannot be published yet. Missing: price",
    });
    expect(renderQuery(db.$["select.where"].mock.calls[2]?.[0])).toEqual({
      params: [7],
      sql: '"product_image"."productId" = $1',
    });
    expect(db.$.update).not.toHaveBeenCalled();
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("re-allocates the slug of a never-published draft from its new title, past its own", async () => {
    const { answerLocks, answerWhere, db } = setup();
    answerLocks([lockedRow()]);
    answerWhere({ takenSlugs: ["aros-de-plata"] });
    const updated = { id: 7, slug: "aros-de-plata-2", status: "draft" };
    db.$["update.returning"].mockResolvedValue([updated]);

    await expect(
      update(
        db,
        productValues({
          translations: [translationInput({ title: "Aros de Plata" })],
        })
      )
    ).resolves.toBe(updated);
    expect(renderQuery(db.$["select.where"].mock.calls[2]?.[0])).toEqual({
      params: [STORE_ID, "aros-de-plata%", 7],
      sql: '("product"."storeId" = $1 and "product"."slug" like $2 and "product"."id" <> $3)',
    });
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      categoryId: 9,
      isAvailable: true,
      priceAmount: 1500,
      slug: "aros-de-plata-2",
    });
  });

  test.each(["draft", "published"] as const)(
    "keeps the slug of a %s article once it was published, replacing its texts",
    async (status) => {
      const { answerLocks, answerWhere, db } = setup();
      answerLocks([lockedRow({ publishedAt: PUBLISHED_AT, status })]);
      db.$["update.returning"].mockResolvedValue([
        { id: 7, slug: "collar-viejo", status },
      ]);
      answerWhere({ imageTotal: 1 });

      await expect(
        update(
          db,
          productValues({
            isAvailable: false,
            translations: [translationInput({ title: "Otro título" })],
          })
        )
      ).resolves.toEqual({ id: 7, slug: "collar-viejo", status });
      expect(db.$.execute).not.toHaveBeenCalled();
      expect(db.$.update).toHaveBeenCalledExactlyOnceWith(product);
      expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
        categoryId: 9,
        isAvailable: false,
        priceAmount: 1500,
        slug: "collar-viejo",
      });
      expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
        params: [7, STORE_ID],
        sql: '("product"."id" = $1 and "product"."storeId" = $2)',
      });
      expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(productTranslation);
      expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
        params: [7],
        sql: '"product_translation"."productId" = $1',
      });
      expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(productTranslation);
      expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith([
        {
          description: "Hecho a mano",
          locale: "es",
          productId: 7,
          seoDescription: null,
          seoTitle: null,
          title: "Otro título",
        },
      ]);
      // The old texts go before the new ones arrive.
      expect(db.$.delete.mock.invocationCallOrder[0]).toBeLessThan(
        db.$.insert.mock.invocationCallOrder[0] ?? 0
      );
    }
  );
});

describe("updateProduct when its update matches nothing", () => {
  test("fails loudly instead of answering a made-up row", async () => {
    const { answerLocks, answerWhere, db } = setup();
    answerLocks([lockedRow()]);
    answerWhere({});
    db.$["update.returning"].mockResolvedValue([]);

    await expect(
      updateProduct(db as never, {
        storeId: STORE_ID,
        values: { ...productValues(), id: 7 },
      })
    ).rejects.toThrow("Updating a locked article matched no row");
  });
});

describe("getPublishedProductRef", () => {
  test("answers the id and category of a published article of the store", async () => {
    const { configOf, db } = setup();
    db.query.product.findFirst.mockResolvedValue({ categoryId: 4, id: 3 });

    await expect(
      getPublishedProductRef(db as never, { slug: "cadena", storeId: STORE_ID })
    ).resolves.toEqual({ categoryId: 4, id: 3 });
    const config = configOf(db.query.product.findFirst);
    expect(config.columns).toEqual({ categoryId: true, id: true });
    expect(renderQuery(config.where)).toEqual({
      params: [STORE_ID, "cadena", "published"],
      sql: '("product"."storeId" = $1 and "product"."slug" = $2 and "product"."status" = $3)',
    });
  });

  test("answers NOT_FOUND for a draft or another store's article", async () => {
    const { db } = setup();

    await expect(
      getPublishedProductRef(db as never, { slug: "cadena", storeId: STORE_ID })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Article not found",
    });
  });
});

describe("createProduct with a long title", () => {
  test("looks for taken slugs by the prefix a suffixed one keeps, not the whole base", async () => {
    const { answerLocks, answerWhere, db } = setup();
    answerLocks();
    const base = "a".repeat(80);
    answerWhere({ takenSlugs: [base, `${"a".repeat(78)}-2`] });
    db.$["insert.returning"].mockResolvedValue([
      { id: 7, slug: `${"a".repeat(78)}-3`, status: "draft" },
    ]);

    await createProduct(db as never, {
      storeId: STORE_ID,
      values: productValues({
        translations: [translationInput({ title: base })],
      }),
    });

    expect(renderQuery(db.$["select.where"].mock.calls[1]?.[0]).params).toEqual(
      [STORE_ID, `${"a".repeat(74)}%`]
    );
    expect(db.$["insert.values"].mock.calls[0]?.[0]).toMatchObject({
      slug: `${"a".repeat(78)}-3`,
    });
  });
});

describe("publishProduct", () => {
  test("refuses an article missing what publishing needs, changing nothing", async () => {
    const { answerLocks, answerWhere, configOf, db } = setup();
    answerLocks([lockedRow({ categoryId: null, priceAmount: null })]);
    answerWhere({ imageTotal: 0 });

    await expect(
      publishProduct(db as never, { id: 7, storeId: STORE_ID })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "The article cannot be published yet. Missing: image, category, price, spanishTitle",
    });
    expect(
      renderQuery(configOf(db.query.productTranslation.findMany).where)
    ).toEqual({
      params: [7],
      sql: '"product_translation"."productId" = $1',
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("publishes a ready article, keeping a first publication date", async () => {
    const { answerLocks, answerWhere, db } = setup();
    answerLocks([lockedRow()]);
    db.query.productTranslation.findMany.mockResolvedValue([
      { locale: "es", title: "Collar" },
    ]);
    answerWhere({ imageTotal: 1 });
    const published = { id: 7, slug: "collar-viejo", status: "published" };
    db.$["update.returning"].mockResolvedValue([published]);

    await expect(
      publishProduct(db as never, { id: 7, storeId: STORE_ID })
    ).resolves.toBe(published);
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(product);
    const [set] = db.$["update.set"].mock.calls[0] ?? [];
    const { publishedAt, ...rest } = set as Record<string, unknown>;
    expect(rest).toEqual({ status: "published" });
    expect(renderSql(publishedAt)).toBe(
      'coalesce("product"."publishedAt", clock_timestamp())'
    );
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [7, STORE_ID],
      sql: '("product"."id" = $1 and "product"."storeId" = $2)',
    });
  });

  test("fails loudly when the update of the locked row returns none", async () => {
    const { answerLocks, answerWhere, db } = setup();
    answerLocks([lockedRow()]);
    db.query.productTranslation.findMany.mockResolvedValue([
      { locale: "es", title: "Collar" },
    ]);
    answerWhere({ imageTotal: 1 });
    db.$["update.returning"].mockResolvedValue([]);

    await expect(
      publishProduct(db as never, { id: 7, storeId: STORE_ID })
    ).rejects.toThrow("Publishing a locked article matched no row");
  });
});

describe("store-scoped single-row writes", () => {
  test("unpublishProduct sets the article back to draft", async () => {
    const { db } = setup();
    const updated = { id: 7, slug: "collar", status: "draft" };
    db.$["update.returning"].mockResolvedValue([updated]);

    await expect(
      unpublishProduct(db as never, { id: 7, storeId: STORE_ID })
    ).resolves.toBe(updated);
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(product);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      status: "draft",
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [7, STORE_ID],
      sql: '("product"."id" = $1 and "product"."storeId" = $2)',
    });
  });

  test("setProductAvailability sets the flag only", async () => {
    const { db } = setup();
    const updated = { id: 7, isAvailable: false };
    db.$["update.returning"].mockResolvedValue([updated]);

    await expect(
      setProductAvailability(db as never, {
        id: 7,
        isAvailable: false,
        storeId: STORE_ID,
      })
    ).resolves.toBe(updated);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      isAvailable: false,
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [7, STORE_ID],
      sql: '("product"."id" = $1 and "product"."storeId" = $2)',
    });
  });

  test("deleteProduct deletes the store's article", async () => {
    const { db } = setup();
    db.$["delete.returning"].mockResolvedValue([{ id: 7 }]);

    await expect(
      deleteProduct(db as never, { id: 7, storeId: STORE_ID })
    ).resolves.toEqual({ id: 7 });
    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(product);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [7, STORE_ID],
      sql: '("product"."id" = $1 and "product"."storeId" = $2)',
    });
  });

  test.each([
    [
      "unpublishProduct",
      async (db: never) =>
        await unpublishProduct(db, { id: 7, storeId: STORE_ID }),
    ],
    [
      "setProductAvailability",
      async (db: never) =>
        await setProductAvailability(db, {
          id: 7,
          isAvailable: true,
          storeId: STORE_ID,
        }),
    ],
    [
      "deleteProduct",
      async (db: never) =>
        await deleteProduct(db, { id: 7, storeId: STORE_ID }),
    ],
  ])(
    "%s answers NOT_FOUND when the store has no such article",
    async (_name, write) => {
      const { db } = setup();

      await expect(write(db as never)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Article not found",
      });
    }
  );
});

describe("reorderProductImages", () => {
  async function reorder(
    db: ReturnType<typeof setup>["db"],
    imageIds: number[]
  ) {
    return await reorderProductImages(db as never, {
      id: 7,
      imageIds,
      storeId: STORE_ID,
    });
  }

  test.each([
    ["a partial list", [1]],
    ["a foreign image", [1, 3]],
    ["an extra image", [1, 2, 3]],
    ["an image given twice instead of each once", [1, 1]],
  ])("refuses %s, changing nothing", async (_name, imageIds) => {
    const { answerLocks, answerWhere, db } = setup();
    answerLocks([lockedRow()]);
    answerWhere({ images: [{ id: 1 }, { id: 2 }] });

    await expect(reorder(db, imageIds)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Give every image of the article, once each",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("puts every image in the given order with one UPDATE", async () => {
    const { answerLocks, answerWhere, db } = setup();
    answerLocks([lockedRow()]);
    answerWhere({ images: [{ id: 1 }, { id: 2 }] });

    await expect(reorder(db, [2, 1])).resolves.toEqual({
      id: 7,
      imageIds: [2, 1],
    });
    expect(db.$["select.for"]).toHaveBeenCalledExactlyOnceWith("update");
    expect(renderQuery(db.$["select.where"].mock.calls[1]?.[0])).toEqual({
      params: [7],
      sql: '"product_image"."productId" = $1',
    });
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(productImage);
    const [set] = db.$["update.set"].mock.calls[0] ?? [];
    expect(renderQuery((set as { position: unknown }).position)).toEqual({
      params: [2, 0, 1, 1],
      sql: 'case "product_image"."id" when $1 then $2::int when $3 then $4::int end',
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [7, 2, 1],
      sql: '("product_image"."productId" = $1 and "product_image"."id" in ($2, $3))',
    });
  });
});
