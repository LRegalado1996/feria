import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { category, product } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderOrderBy, renderQuery } from "@/server/test/render-sql";

import {
  getAllArticlesCover,
  getCategoryPage,
  getPublishedProduct,
  getPublishedProductRef,
  listCartProducts,
  countPublishedByCategory,
  listCategories,
  listCategoryArticles,
  listPublishedProducts,
  listShownCategories,
  listRelatedPool,
  listRelatedProducts,
} from "./catalog";

const STORE_ID = 3;
const PUBLISHED_AT = new Date("2026-11-10T12:00:00.123Z");

/** The `where`, `orderBy` and `columns` a relational read was handed. */
interface ReadConfig {
  columns?: Record<string, boolean>;
  orderBy?: unknown;
  where: unknown;
  with?: Record<string, unknown>;
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
        parentId: null,
        position: 0,
        showInHeader: true,
        slug: "collares",
        translations: [
          { locale: "es", name: "Collares" },
          { locale: "en", name: "Necklaces" },
        ],
      },
      {
        id: 2,
        parentId: 1,
        position: 1,
        showInHeader: true,
        slug: "aros",
        translations: [{ locale: "es", name: "Aros" }],
      },
      {
        id: 3,
        // A group the list does not hold leaves the category at the top.
        parentId: 99,
        position: 2,
        showInHeader: false,
        slug: "sin-nombre",
        translations: [],
      },
    ]);

    await expect(
      listCategories(db as never, { locale: "en", storeId: STORE_ID })
    ).resolves.toEqual([
      {
        id: 1,
        lang: "en",
        name: "Necklaces",
        parentId: null,
        path: "/collares",
        position: 0,
        showInHeader: true,
        slug: "collares",
      },
      {
        id: 2,
        lang: "es",
        name: "Aros",
        parentId: 1,
        path: "/collares/aros",
        position: 1,
        showInHeader: true,
        slug: "aros",
      },
      {
        id: 3,
        lang: "en",
        name: "",
        parentId: 99,
        path: "/sin-nombre",
        position: 2,
        showInHeader: false,
        slug: "sin-nombre",
      },
    ]);
    const config = configOf(db.query.category.findMany);
    // The header's choice travels with each one (FER-051).
    expect(config.columns).toEqual({
      id: true,
      parentId: true,
      position: true,
      showInHeader: true,
      slug: true,
    });
    expect(renderQuery(config.where)).toEqual({
      params: [STORE_ID],
      sql: '"category"."storeId" = $1',
    });
    expect(renderOrderBy(config.orderBy)).toBe(
      '"category"."position" asc, "category"."id" asc'
    );
  });
});

/** A category's row as `listCategories` reads it. */
function makeCategoryRow(
  id: number,
  parentId: number | null,
  slug: string
): Record<string, unknown> {
  return {
    id,
    parentId,
    position: id,
    showInHeader: true,
    slug,
    translations: [{ locale: "es", name: slug }],
  };
}

describe("listShownCategories", () => {
  test("lists only the categories with a published article, and a group only while one of its categories has one (FER-079)", async () => {
    const { db } = setup();
    db.query.category.findMany.mockResolvedValue([
      // A group whose category Anillos holds an article: both show.
      makeCategoryRow(1, null, "bijouterie"),
      makeCategoryRow(2, 1, "anillos"),
      // Aros, in the same group, holds none.
      makeCategoryRow(3, 1, "aros"),
      // A group whose only category holds none: neither shows.
      makeCategoryRow(4, null, "juguetes"),
      makeCategoryRow(5, 4, "autos"),
      // In no group, with an article; and in no group, with none.
      makeCategoryRow(6, null, "burbujeros"),
      makeCategoryRow(7, null, "relojes"),
    ]);
    db.$["select.orderBy"].mockResolvedValue([
      { categoryId: 2, count: 1 },
      { categoryId: 6, count: 3 },
    ]);

    const shown = await listShownCategories(db as never, {
      locale: "es",
      storeId: STORE_ID,
    });

    expect(shown.map(({ id, path }) => ({ id, path }))).toEqual([
      { id: 1, path: "/bijouterie" },
      { id: 2, path: "/bijouterie/anillos" },
      { id: 6, path: "/burbujeros" },
    ]);
    // The rule is the rows' own: published, sold out or not.
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, "published"],
      sql: '("product"."storeId" = $1 and "product"."status" = $2 and "product"."categoryId" is not null)',
    });
  });

  test("a store with no published article lists no category", async () => {
    const { db } = setup();
    db.query.category.findMany.mockResolvedValue([
      makeCategoryRow(1, null, "bijouterie"),
      makeCategoryRow(2, 1, "anillos"),
    ]);

    await expect(
      listShownCategories(db as never, { locale: "es", storeId: STORE_ID })
    ).resolves.toEqual([]);
  });
});

/** A category's row as `getCategoryPage` reads it, a group with no cover. */
function makePageRow(overrides: Record<string, unknown> = {}) {
  return {
    children: [
      {
        id: 61,
        slug: "anillos",
        translations: [
          { locale: "es", name: "Anillos" },
          { locale: "en", name: "Rings" },
        ],
      },
      { id: 62, slug: "aros", translations: [{ locale: "es", name: "Aros" }] },
    ],
    coverHeight: null,
    coverPhoneHeight: null,
    coverPhoneUrl: null,
    coverPhoneWidth: null,
    coverUrl: null,
    coverWidth: null,
    id: 6,
    parent: null,
    slug: "bijouterie",
    translations: [
      {
        coverAlt: null,
        locale: "es",
        name: "Bijouterie",
        seoDescription: null,
        seoTitle: null,
      },
      {
        coverAlt: null,
        locale: "en",
        name: "Jewelry",
        seoDescription: "Jewelry from the fair",
        seoTitle: "Jewelry at LR Market",
      },
    ],
    ...overrides,
  };
}

describe("getCategoryPage", () => {
  test("reads a group's page in the asked language: its categories under it, its texts, no cover", async () => {
    const { configOf, db } = setup();
    db.query.category.findFirst.mockResolvedValue(makePageRow());
    db.$["select.orderBy"].mockResolvedValue([
      { categoryId: 61, count: 2 },
      { categoryId: 62, count: 1 },
    ]);

    await expect(
      getCategoryPage(db as never, {
        locale: "en",
        slug: "bijouterie",
        storeId: STORE_ID,
      })
    ).resolves.toEqual({
      children: [
        {
          lang: "en",
          name: "Rings",
          path: "/bijouterie/anillos",
          slug: "anillos",
        },
        { lang: "es", name: "Aros", path: "/bijouterie/aros", slug: "aros" },
      ],
      cover: null,
      id: 6,
      isShown: true,
      lang: "en",
      name: "Jewelry",
      parent: null,
      path: "/bijouterie",
      seoDescription: "Jewelry from the fair",
      seoTitle: "Jewelry at LR Market",
      slug: "bijouterie",
    });
    const config = configOf(db.query.category.findFirst);
    expect(renderQuery(config.where)).toEqual({
      params: [STORE_ID, "bijouterie"],
      sql: '("category"."storeId" = $1 and "category"."slug" = $2)',
    });
    // Its categories in the store's order, which the page's text and links
    // follow, not in whatever order the database returns them.
    const children = config.with?.children as { orderBy?: unknown };
    expect(renderOrderBy(children.orderBy)).toBe(
      '"category"."position" asc, "category"."id" asc'
    );
  });

  test("reads a category in a group with its cover, its group's name and its own alt text", async () => {
    const { db } = setup();
    db.query.category.findFirst.mockResolvedValue(
      makePageRow({
        children: [],
        coverHeight: 800,
        coverPhoneHeight: 1200,
        coverPhoneUrl: "/seed/ring-1.jpg",
        coverPhoneWidth: 1200,
        coverUrl: "/seed/ring-2.jpg",
        coverWidth: 1200,
        id: 3,
        parent: {
          slug: "bijouterie",
          translations: [{ locale: "es", name: "Bijouterie" }],
        },
        slug: "anillos",
        translations: [
          {
            coverAlt: "Anillo sello dorado",
            locale: "es",
            name: "Anillos",
            seoDescription: null,
            seoTitle: null,
          },
        ],
      })
    );

    await expect(
      getCategoryPage(db as never, {
        locale: "es",
        slug: "anillos",
        storeId: STORE_ID,
      })
    ).resolves.toMatchObject({
      children: [],
      cover: {
        alt: "Anillo sello dorado",
        computer: { height: 800, url: "/seed/ring-2.jpg", width: 1200 },
        phone: { height: 1200, url: "/seed/ring-1.jpg", width: 1200 },
      },
      name: "Anillos",
      parent: {
        lang: "es",
        name: "Bijouterie",
        path: "/bijouterie",
        slug: "bijouterie",
      },
      path: "/bijouterie/anillos",
      seoDescription: null,
      seoTitle: null,
    });
  });

  test("a group lists only its categories with a published article, and shows while one has (FER-079)", async () => {
    const { db } = setup();
    db.query.category.findFirst.mockResolvedValue(makePageRow());
    db.$["select.orderBy"].mockResolvedValue([{ categoryId: 62, count: 1 }]);

    await expect(
      getCategoryPage(db as never, {
        locale: "es",
        slug: "bijouterie",
        storeId: STORE_ID,
      })
    ).resolves.toMatchObject({
      children: [
        { lang: "es", name: "Aros", path: "/bijouterie/aros", slug: "aros" },
      ],
      isShown: true,
    });
  });

  test.each([
    {
      children: makePageRow().children,
      name: "a group whose categories hold none",
      shown: false,
      stocked: [],
    },
    {
      children: [],
      name: "a category that holds none",
      shown: false,
      stocked: [{ categoryId: 61, count: 4 }],
    },
    {
      children: [],
      name: "a category that holds one",
      shown: true,
      stocked: [{ categoryId: 6, count: 1 }],
    },
  ])(
    "$name is shown on the storefront: $shown (FER-079)",
    async ({ children, shown, stocked }) => {
      const { db } = setup();
      db.query.category.findFirst.mockResolvedValue(makePageRow({ children }));
      db.$["select.orderBy"].mockResolvedValue(stocked);

      const page = await getCategoryPage(db as never, {
        locale: "es",
        slug: "bijouterie",
        storeId: STORE_ID,
      });

      expect(page).toMatchObject({ children: [], isShown: shown });
    }
  );

  test("answers null for a slug the store has no category at", async () => {
    const { db } = setup();

    await expect(
      getCategoryPage(db as never, {
        locale: "es",
        slug: "anillos",
        storeId: STORE_ID,
      })
    ).resolves.toBeNull();
  });
});

describe("getAllArticlesCover", () => {
  const STORE_ROW = {
    catalogCoverHeight: 800,
    catalogCoverPhoneHeight: null,
    catalogCoverPhoneUrl: null,
    catalogCoverPhoneWidth: null,
    catalogCoverUrl: "/seed/ring-3.jpg",
    catalogCoverWidth: 1200,
    translations: [
      { catalogCoverAlt: "Anillo con piedras", locale: "es" },
      { catalogCoverAlt: null, locale: "en" },
    ],
  };

  test.each([
    ["es", "Anillo con piedras"],
    // The English row has no alt text: the page's name describes it.
    ["en", "All articles"],
  ] as const)(
    "describes the store's cover in %s as %j",
    async (locale, alt) => {
      const { configOf, db } = setup();
      db.query.store.findFirst.mockResolvedValue(STORE_ROW);

      await expect(
        getAllArticlesCover(db as never, {
          fallbackAlt: "All articles",
          locale,
          storeId: STORE_ID,
        })
      ).resolves.toEqual({
        alt,
        computer: { height: 800, url: "/seed/ring-3.jpg", width: 1200 },
        phone: null,
      });
      expect(renderQuery(configOf(db.query.store.findFirst).where)).toEqual({
        params: [STORE_ID],
        sql: '"store"."id" = $1',
      });
    }
  );

  test.each([
    ["no store", undefined],
    [
      "a store without a cover",
      {
        ...STORE_ROW,
        catalogCoverHeight: null,
        catalogCoverUrl: null,
        catalogCoverWidth: null,
      },
    ],
  ])("answers null for %s", async (_case, row) => {
    const { db } = setup();
    db.query.store.findFirst.mockResolvedValue(row);

    await expect(
      getAllArticlesCover(db as never, {
        fallbackAlt: "Todos",
        locale: "es",
        storeId: STORE_ID,
      })
    ).resolves.toBeNull();
  });
});

/**
 * The store's order (FER-019) as SQL, its two parameters (`FEATURED_MAX`
 * and the day) numbered from `first`.
 */
function storeRank(first: number) {
  return (
    'coalesce((select "featured_product"."position" from "featured_product" ' +
    'where "featured_product"."storeId" = "product"."storeId" and "featured_product"."productId" = "product"."id"), ' +
    `$${first}::int + (hashtext("product"."id"::text || ':' || $${first + 1}::text) & 1073741823))`
  );
}

describe("listPublishedProducts", () => {
  async function list(
    db: ReturnType<typeof setup>["db"],
    overrides: Partial<Parameters<typeof listPublishedProducts>[1]> = {}
  ) {
    return await listPublishedProducts(db as never, {
      currencyCode: "UYU",
      day: "2026-11-25",
      limit: 2,
      locale: "es",
      storeId: STORE_ID,
      ...overrides,
    });
  }

  test("filters by the store and the published status, in the store's order, asking one row past the page", async () => {
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
    // The featured first, then the day's shuffle; the id breaks a tie.
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      `${storeRank(1)} asc, "product"."id" asc`
    );
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(3);
    // An empty page asks no card query.
    expect(db.query.product.findMany).not.toHaveBeenCalled();
  });

  test("narrows by category slug, escaped search and the cursor", async () => {
    const { db } = setup();

    await list(db, {
      category: "collares",
      cursor: {
        id: 40,
        publishedAt: "2026-11-01T00:00:00.000Z",
        sort: "newest",
      },
      locale: "en",
      q: String.raw`50%_off\x`,
      sort: "newest",
    });

    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [
        STORE_ID,
        "published",
        "collares",
        "collares",
        "en",
        "es",
        "en",
        String.raw`%50\%\_off\\x%`,
        String.raw`%50\%\_off\\x%`,
        "2026-11-01T00:00:00.000Z",
        40,
      ],
      // The category, or a group holding it (FER-043): a group's page
      // lists every article in it.
      sql:
        '("product"."storeId" = $1 and "product"."status" = $2 and ("category"."slug" = $3 or ' +
        'exists (select 1 from "category" as "category_group" where ("category_group"."id" = "category"."parentId" and ' +
        '"category_group"."storeId" = "category"."storeId" and "category_group"."slug" = $4))) and ' +
        'exists (select 1 from "product_translation" as "shown" where ("shown"."productId" = "product"."id" and ' +
        '("shown"."locale" = $5 or ("shown"."locale" = $6 and not exists (select 1 from "product_translation" as "own" ' +
        'where ("own"."productId" = "product"."id" and "own"."locale" = $7)))) and ' +
        '(unaccent("shown"."title") ilike unaccent($8) or unaccent("shown"."description") ilike unaccent($9)))) and ' +
        '("product"."publishedAt", "product"."id") < ($10::timestamptz, $11::int))',
    });
  });

  test.each([
    ["no groups", undefined],
    ["an empty list of groups", []],
  ])("asks no filter condition with %s", async (_case, valueGroups) => {
    const { db } = setup();

    await list(db, { valueGroups });

    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, "published"],
      sql: '("product"."storeId" = $1 and "product"."status" = $2)',
    });
  });

  test("narrows by one EXISTS per filter, its values alternatives, before the cursor", async () => {
    const { db } = setup();

    await list(db, {
      cursor: {
        id: 40,
        publishedAt: "2026-11-01T00:00:00.000Z",
        sort: "newest",
      },
      sort: "newest",
      valueGroups: [[21, 22], [31]],
    });

    const carries = (placeholders: string) =>
      'exists (select 1 from "product_attribute_value" where ' +
      '("product_attribute_value"."productId" = "product"."id" and ' +
      `"product_attribute_value"."attributeValueId" in (${placeholders})))`;
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [
        STORE_ID,
        "published",
        21,
        22,
        31,
        "2026-11-01T00:00:00.000Z",
        40,
      ],
      sql:
        '("product"."storeId" = $1 and "product"."status" = $2 and ' +
        `${carries("$3, $4")} and ${carries("$5")} and ` +
        '("product"."publishedAt", "product"."id") < ($6::timestamptz, $7::int))',
    });
  });

  const BASE_WHERE =
    '("product"."storeId" = $1 and "product"."status" = $2 and ';

  test.each([
    [undefined, `${storeRank(1)} asc, "product"."id" asc`],
    ["position", `${storeRank(1)} asc, "product"."id" asc`],
    ["newest", '"product"."publishedAt" desc, "product"."id" desc'],
    ["price_asc", '"product"."priceAmount" asc, "product"."id" asc'],
    ["price_desc", '"product"."priceAmount" desc, "product"."id" desc'],
  ] as const)("orders a sort of %j by %s", async (sort, orderBy) => {
    const { db } = setup();

    await list(db, sort === undefined ? {} : { sort });

    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(orderBy);
    // The page reads each sort's key, for the next cursor: the store's
    // order's is the article's rank on the day.
    const [columns] = db.$.select.mock.calls[0] ?? [];
    expect(columns).toMatchObject({
      id: product.id,
      priceAmount: product.priceAmount,
      publishedAt: product.publishedAt,
    });
    const position =
      typeof columns === "object" && columns !== null && "position" in columns
        ? columns.position
        : undefined;
    expect(renderQuery(position)).toEqual({
      params: [16, "2026-11-25"],
      sql: storeRank(1),
    });
  });

  test.each([
    [
      "position",
      { id: 40, position: 12, sort: "position" },
      `(${storeRank(3)}, "product"."id") > ($5::int, $6::int))`,
      12,
    ],
    [
      "newest",
      { id: 40, publishedAt: "2026-11-01T00:00:00.000Z", sort: "newest" },
      '("product"."publishedAt", "product"."id") < ($3::timestamptz, $4::int))',
      "2026-11-01T00:00:00.000Z",
    ],
    [
      "price_asc",
      { id: 40, priceAmount: 69_000, sort: "price_asc" },
      '("product"."priceAmount", "product"."id") > ($3::int, $4::int))',
      69_000,
    ],
    [
      "price_desc",
      { id: 40, priceAmount: 69_000, sort: "price_desc" },
      '("product"."priceAmount", "product"."id") < ($3::int, $4::int))',
      69_000,
    ],
  ] as const)(
    "starts a %s page strictly after its cursor",
    async (sort, cursor, predicate, key) => {
      const { db } = setup();

      await list(db, { cursor, sort });

      expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
        // The store's order compares its rank on the day.
        params:
          sort === "position"
            ? [STORE_ID, "published", 16, "2026-11-25", key, 40]
            : [STORE_ID, "published", key, 40],
        sql: `${BASE_WHERE}${predicate}`,
      });
    }
  );

  test.each([
    ["position", { id: 40, priceAmount: 69_000, sort: "price_asc" }],
    ["price_asc", { id: 40, position: 12, sort: "position" }],
    ["newest", { id: 40, position: 12, sort: "position" }],
    // Its own sort without that sort's key is no cursor of it.
    ["position", { id: 40, priceAmount: 12, sort: "position" }],
    ["newest", { id: 40, priceAmount: 69_000, sort: "price_asc" }],
    [
      "price_asc",
      { id: 40, publishedAt: "2026-11-01T00:00:00.000Z", sort: "newest" },
    ],
    [
      "price_desc",
      { id: 40, publishedAt: "2026-11-01T00:00:00.000Z", sort: "newest" },
    ],
    // Both price orders carry a price: only the sort tells them apart.
    ["price_desc", { id: 40, priceAmount: 69_000, sort: "price_asc" }],
    ["price_asc", { id: 40, priceAmount: 69_000, sort: "price_desc" }],
    // Its own sort without that sort's key is no cursor of it either.
    ["newest", { id: 40, priceAmount: 69_000, sort: "newest" }],
    [
      "price_asc",
      { id: 40, publishedAt: "2026-11-01T00:00:00.000Z", sort: "price_asc" },
    ],
  ] as const)(
    "refuses a %s page from cursor %j, asking nothing",
    async (sort, cursor) => {
      const { db } = setup();

      await expect(list(db, { cursor, sort })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "That cursor belongs to another sort",
      });
      expect(db.$["select.limit"]).not.toHaveBeenCalled();
      expect(db.query.product.findMany).not.toHaveBeenCalled();
    }
  );

  /** Three page rows for a page of two: the second is the cursor's row. */
  function pageRows(second: Record<string, unknown>) {
    return [
      { id: 5, position: 1, priceAmount: 50_000, publishedAt: PUBLISHED_AT },
      {
        id: 4,
        position: 2,
        priceAmount: 60_000,
        publishedAt: PUBLISHED_AT,
        ...second,
      },
      { id: 3, position: 3, priceAmount: 70_000, publishedAt: PUBLISHED_AT },
    ];
  }

  test.each([
    // The store's order carries the day it was dealt for (FER-019).
    [
      "position",
      {},
      { day: "2026-11-25", id: 4, position: 2, sort: "position" },
    ],
    // The first place in "Destacados" is a place too.
    [
      "position",
      { position: 0 },
      { day: "2026-11-25", id: 4, position: 0, sort: "position" },
    ],
    [
      "newest",
      {},
      { id: 4, publishedAt: PUBLISHED_AT.toISOString(), sort: "newest" },
    ],
    ["price_asc", {}, { id: 4, priceAmount: 60_000, sort: "price_asc" }],
    ["price_desc", {}, { id: 4, priceAmount: 60_000, sort: "price_desc" }],
    // A free article is a price too, not a missing one.
    [
      "price_asc",
      { priceAmount: 0 },
      { id: 4, priceAmount: 0, sort: "price_asc" },
    ],
    // Defensive: a published row always has both (the database's checks).
    ["newest", { publishedAt: null }, null],
    ["price_asc", { priceAmount: null }, null],
  ] as const)(
    "gives a %s page's next cursor that sort's key: %j → %j",
    async (sort, second, nextCursor) => {
      const { db } = setup();
      db.$["select.limit"].mockResolvedValue(pageRows(second));
      db.query.product.findMany.mockResolvedValue([cardRow(5), cardRow(4)]);

      await expect(list(db, { sort })).resolves.toEqual({
        items: [card(5), card(4)],
        nextCursor,
      });
    }
  );

  test("a cursor from another day goes on in that day's order, and hands that day on: no repeat or gap past midnight", async () => {
    const { db } = setup();
    db.$["select.limit"].mockResolvedValue(pageRows({}));
    db.query.product.findMany.mockResolvedValue([cardRow(5), cardRow(4)]);

    await expect(
      list(db, {
        cursor: { day: "2026-11-24", id: 40, position: 12, sort: "position" },
        sort: "position",
      })
    ).resolves.toMatchObject({
      nextCursor: { day: "2026-11-24", id: 4, position: 2, sort: "position" },
    });
    // Ranked, compared and ordered by the cursor's day, not today's.
    const [columns] = db.$.select.mock.calls[0] ?? [];
    const position =
      typeof columns === "object" && columns !== null && "position" in columns
        ? columns.position
        : undefined;
    expect(renderQuery(position).params).toEqual([16, "2026-11-24"]);
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0]).params).toEqual(
      [STORE_ID, "published", 16, "2026-11-24", 12, 40]
    );
    expect(
      renderQuery(db.$["select.orderBy"].mock.calls[0]?.[0]).params
    ).toEqual([16, "2026-11-24"]);
  });

  test("has no next cursor for an empty page, even with a row past it", async () => {
    const { db } = setup();
    db.$["select.limit"].mockResolvedValue(pageRows({}).slice(0, 1));

    await expect(list(db, { limit: 0 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(1);
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

    await expect(list(db, { sort: "newest" })).resolves.toEqual({
      items: [card(5), card(4)],
      nextCursor: {
        id: 4,
        publishedAt: "2026-11-09T08:00:00.000Z",
        sort: "newest",
      },
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
      category: {
        group: null,
        name: "Necklaces",
        path: "/collares",
        slug: "collares",
      },
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

  test("places a category in a group under it, named in the asked language (FER-043)", async () => {
    const { configOf, db } = setup();
    db.query.product.findFirst.mockResolvedValue(
      detailRow({
        category: {
          parent: {
            slug: "bijouterie",
            translations: [
              { locale: "es", name: "Bijouterie" },
              { locale: "en", name: "Jewelry" },
            ],
          },
          slug: "anillos",
          translations: [{ locale: "en", name: "Rings" }],
        },
      })
    );

    await expect(get(db)).resolves.toMatchObject({
      category: {
        group: { name: "Jewelry", path: "/bijouterie" },
        name: "Rings",
        path: "/bijouterie/anillos",
        slug: "anillos",
      },
    });
    expect(configOf(db.query.product.findFirst).with?.category).toEqual({
      columns: { slug: true },
      with: {
        parent: {
          columns: { slug: true },
          with: { translations: { columns: { locale: true, name: true } } },
        },
        translations: { columns: { locale: true, name: true } },
      },
    });
  });
});

describe("listCartProducts", () => {
  async function cartProducts(
    db: ReturnType<typeof setup>["db"],
    ids: number[],
    currencyCode: Parameters<typeof listCartProducts>[1]["currencyCode"] = "UYU"
  ) {
    return await listCartProducts(db as never, {
      currencyCode,
      ids,
      locale: "es",
      storeId: STORE_ID,
    });
  }

  test("keeps only the store's published articles among the ids asked, then reads their cards", async () => {
    const { configOf, db } = setup();
    db.$["select.where"].mockResolvedValue([{ id: 5 }, { id: 8 }]);
    db.query.product.findMany.mockResolvedValue([cardRow(5), cardRow(8)]);

    await cartProducts(db, [8, 6, 5]);

    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(product);
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, "published", 8, 6, 5],
      sql: '("product"."storeId" = $1 and "product"."status" = $2 and "product"."id" in ($3, $4, $5))',
    });
    // The card query is asked only for the ids the store owns, still
    // published.
    expect(renderQuery(configOf(db.query.product.findMany).where)).toEqual({
      params: [8, 5, "published"],
      sql: '("product"."id" in ($1, $2) and "product"."status" = $3)',
    });
  });

  test.each(["UYU", "USD"] as const)(
    "answers the cards in the order the cart asked, in the store's currency (%s), leaving out an id it does not own",
    async (currencyCode) => {
      const { db } = setup();
      db.$["select.where"].mockResolvedValue([{ id: 5 }, { id: 8 }]);
      db.query.product.findMany.mockResolvedValue([
        cardRow(5),
        cardRow(8, { isAvailable: false, priceAmount: 2100 }),
      ]);

      await expect(cartProducts(db, [8, 6, 5], currencyCode)).resolves.toEqual([
        card(8, { currencyCode, isAvailable: false, priceAmount: 2100 }),
        card(5, { currencyCode }),
      ]);
    }
  );

  test("answers none, with no card query, when the store owns none of the ids", async () => {
    const { db } = setup();
    db.$["select.where"].mockResolvedValue([]);

    await expect(cartProducts(db, [41, 42])).resolves.toEqual([]);
    expect(db.query.product.findMany).not.toHaveBeenCalled();
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

describe("listRelatedPool", () => {
  async function pool(
    db: ReturnType<typeof setup>["db"],
    categoryId: number | null
  ) {
    return await listRelatedPool(db as never, {
      categoryId,
      currencyCode: "UYU",
      locale: "es",
      productId: 7,
      storeId: STORE_ID,
    });
  }

  /** The nth id query's filter, as SQL. */
  function whereOf(db: ReturnType<typeof setup>["db"], call: number) {
    return renderQuery(db.$["select.where"].mock.calls[call]?.[0]);
  }

  test("with four others in the category, hands over those only, newest first, sixteen at most", async () => {
    const { db } = setup();
    db.$["select.limit"].mockResolvedValueOnce([
      { id: 5 },
      { id: 4 },
      { id: 3 },
      { id: 2 },
    ]);
    db.query.product.findMany.mockResolvedValue([
      cardRow(2),
      cardRow(3),
      cardRow(4),
      cardRow(5),
    ]);

    await expect(pool(db, 9)).resolves.toEqual({
      others: [],
      same: [card(5), card(4), card(3), card(2)],
    });
    expect(db.$.select).toHaveBeenCalledExactlyOnceWith({ id: product.id });
    expect(whereOf(db, 0)).toEqual({
      params: [STORE_ID, "published", 7, 9],
      sql: '(("product"."storeId" = $1 and "product"."status" = $2 and "product"."id" <> $3) and "product"."categoryId" = $4)',
    });
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"product"."publishedAt" desc, "product"."id" desc'
    );
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(16);
  });

  test("with three others in the category, adds the rest of the store, outside the category or in none", async () => {
    const { db } = setup();
    db.$["select.limit"]
      .mockResolvedValueOnce([{ id: 5 }, { id: 4 }, { id: 3 }])
      .mockResolvedValueOnce([{ id: 20 }, { id: 21 }]);
    db.query.product.findMany.mockResolvedValue(
      [3, 4, 5, 20, 21].map((id) => cardRow(id))
    );

    await expect(pool(db, 9)).resolves.toEqual({
      others: [card(20), card(21)],
      same: [card(5), card(4), card(3)],
    });
    expect(whereOf(db, 1)).toEqual({
      params: [STORE_ID, "published", 7, 9],
      sql: '(("product"."storeId" = $1 and "product"."status" = $2 and "product"."id" <> $3) and ("product"."categoryId" is null or "product"."categoryId" <> $4))',
    });
    expect(db.$["select.limit"]).toHaveBeenNthCalledWith(2, 16);
  });

  test("an article moved out of the category between the two reads is handed over once, among the category's", async () => {
    const { db } = setup();
    db.$["select.limit"]
      .mockResolvedValueOnce([{ id: 11 }, { id: 12 }, { id: 13 }])
      // By the second read 11 sits in another category.
      .mockResolvedValueOnce([{ id: 11 }, { id: 20 }]);
    db.query.product.findMany.mockResolvedValue(
      [11, 12, 13, 20].map((id) => cardRow(id))
    );

    await expect(pool(db, 9)).resolves.toEqual({
      others: [card(20)],
      same: [card(11), card(12), card(13)],
    });
  });

  test("for an article without a category, hands over the rest of the store only", async () => {
    const { db } = setup();
    db.$["select.limit"].mockResolvedValueOnce([{ id: 20 }]);
    db.query.product.findMany.mockResolvedValue([cardRow(20)]);

    await expect(pool(db, null)).resolves.toEqual({
      others: [card(20)],
      same: [],
    });
    expect(db.$.select).toHaveBeenCalledExactlyOnceWith({ id: product.id });
    expect(whereOf(db, 0)).toEqual({
      params: [STORE_ID, "published", 7],
      sql: '("product"."storeId" = $1 and "product"."status" = $2 and "product"."id" <> $3)',
    });
  });

  test("with nothing else published, hands over nothing and reads no card", async () => {
    const { db } = setup();
    db.$["select.limit"].mockResolvedValue([]);

    await expect(pool(db, 9)).resolves.toEqual({ others: [], same: [] });
    expect(db.query.product.findMany).not.toHaveBeenCalled();
  });
});

describe("countPublishedByCategory", () => {
  test("counts each category's published articles in the store, leaving out the ones in none", async () => {
    const { db } = setup();
    db.$["select.orderBy"].mockResolvedValue([
      { categoryId: 2, count: 5 },
      { categoryId: null, count: 3 },
      { categoryId: 9, count: 1 },
    ]);

    await expect(
      countPublishedByCategory(db as never, { storeId: STORE_ID })
    ).resolves.toEqual([
      { categoryId: 2, count: 5 },
      { categoryId: 9, count: 1 },
    ]);
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, "published"],
      sql: '("product"."storeId" = $1 and "product"."status" = $2 and "product"."categoryId" is not null)',
    });
    expect(db.$["select.groupBy"]).toHaveBeenCalledExactlyOnceWith(
      product.categoryId
    );
  });
});

describe("listCategoryArticles", () => {
  test("hands over the category's newest published articles as cards, eight at most", async () => {
    const { db } = setup();
    db.$["select.limit"].mockResolvedValue([{ id: 5 }, { id: 4 }]);
    db.query.product.findMany.mockResolvedValue([cardRow(4), cardRow(5)]);

    await expect(
      listCategoryArticles(db as never, {
        categoryId: 9,
        currencyCode: "UYU",
        locale: "es",
        storeId: STORE_ID,
      })
    ).resolves.toEqual([card(5), card(4)]);
    expect(renderQuery(db.$["select.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, "published", 9],
      sql: '("product"."storeId" = $1 and "product"."status" = $2 and "product"."categoryId" = $3)',
    });
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"product"."publishedAt" desc, "product"."id" desc'
    );
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(8);
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
