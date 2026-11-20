import { randomUUID } from "node:crypto";

import { describe, expect, test } from "vitest";

import type {
  CreateBannerValues,
  SaveAnnouncementValues,
  SaveHomeLayoutValues,
  UpdateBannerValues,
} from "@/lib/schemas/home";
import {
  announcement,
  announcementTranslation,
  banner,
  bannerTranslation,
  category,
  featuredProduct,
  homeSection,
  product,
  rankingEntry,
  store,
} from "@/server/db/schema";
import { createMockDatabase, type MockDatabase } from "@/server/test/context";
import { renderOrderBy, renderQuery } from "@/server/test/render-sql";

import {
  createBanner,
  deleteBanner,
  findShowingAnnouncement,
  getHomeContent,
  getHomeCuration,
  lockStoreHome,
  saveAnnouncement,
  saveHomeLayout,
  updateBanner,
} from "./home";
import type { BlobStore } from "./upload";

const STORE_ID = 7;
const TODAY = "2026-12-04";
const HOST = "store9.public.blob.vercel-storage.com";
const BLOB_STORE: BlobStore = {
  host: HOST,
  namespace: "qa",
  token: "vercel_blob_rw_Store9_s3cretPart",
};
const SEED_IMAGE = { height: 1067, url: "/seed/bubbles-1.jpg", width: 1600 };

/** An upload of this deployment for banners, a new name each call. */
function makeUpload(purpose = "banner") {
  return {
    height: 1067,
    url: `https://${HOST}/qa/${purpose}/${randomUUID()}.webp`,
    width: 1600,
  };
}

/**
 * Answers every builder chain by the table its `from` named, whatever step
 * it ends on: the lock's three reads share their last steps.
 */
function answerSelects(db: MockDatabase, rows: Map<unknown, unknown[]>) {
  const read: { table: unknown } = { table: null };
  const answer = async () => await Promise.resolve(rows.get(read.table) ?? []);

  db.$["select.from"].mockImplementation((table: unknown) => {
    read.table = table;
  });
  db.$["select.where"].mockImplementation(answer);
  db.$["select.orderBy"].mockImplementation(answer);
  db.$["select.for"].mockImplementation(answer);
}

/** The tables each `select` chain read, and the lock each took, in order. */
function readsOf(db: MockDatabase) {
  return {
    locks: db.$["select.for"].mock.calls.map(([strength]) => strength),
    tables: db.$["select.from"].mock.calls.map(([table]) => table),
  };
}

function makeBannerRow(overrides: Record<string, unknown> = {}) {
  return {
    coverPosition: 0,
    endsOn: null,
    id: 5,
    imageHeight: 1067,
    imagePhoneHeight: null,
    imagePhoneUrl: null,
    imagePhoneWidth: null,
    imageUrl: "/seed/bubbles-1.jpg",
    imageWidth: 1600,
    isActive: true,
    linkCategory: null,
    linkCategoryId: null,
    linkProduct: null,
    linkProductId: null,
    linkUrl: null,
    placement: "cover",
    startsOn: null,
    translations: [
      { ctaLabel: "Mirá", locale: "es", title: "Burbujas" },
      { ctaLabel: null, locale: "en", title: "Bubbles" },
    ],
    ...overrides,
  };
}

function makeProductRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    category: { slug: "anillos" },
    id,
    images: [],
    isAvailable: true,
    priceAmount: 1290,
    publishedAt: new Date("2026-11-01T12:00:00Z"),
    slug: `articulo-${id}`,
    translations: [{ locale: "es", title: `Artículo ${id}` }],
    ...overrides,
  };
}

/** The card `loadCards` makes of {@link makeProductRow}. */
function makeCard(id: number, overrides: Record<string, unknown> = {}) {
  return {
    categorySlug: "anillos",
    cover: null,
    currencyCode: "UYU",
    id,
    isAvailable: true,
    lang: "es",
    priceAmount: 1290,
    slug: `articulo-${id}`,
    title: `Artículo ${id}`,
    ...overrides,
  };
}

/**
 * The rows the `call`-th `values()` (or `set()`) received, as a list: one
 * row's object is a list of one.
 */
function insertedRows(
  db: MockDatabase,
  call: number,
  step: "insert.values" | "update.set" = "insert.values"
): Record<string, unknown>[] {
  const [rows] = db.$[step].mock.calls[call] ?? [];

  if (Array.isArray(rows)) {
    return rows.filter(
      (row): row is Record<string, unknown> =>
        typeof row === "object" && row !== null
    );
  }

  return typeof rows === "object" && rows !== null ? [{ ...rows }] : [];
}

describe("lockStoreHome", () => {
  test("takes the store's home advisory lock for the transaction", async () => {
    const db = createMockDatabase();

    await lockStoreHome(db as never, STORE_ID);

    const [statement] = db.$.execute.mock.calls[0] ?? [];
    expect(renderQuery(statement)).toEqual({
      params: ["home:7"],
      sql: "select pg_advisory_xact_lock(hashtext($1))",
    });
  });
});

describe("findShowingAnnouncement", () => {
  function setup(found: unknown) {
    const db = createMockDatabase();
    db.query.announcement.findFirst.mockResolvedValue(found);

    return {
      db,
      find: async (locale: "en" | "es") =>
        await findShowingAnnouncement(db as never, {
          locale,
          storeId: STORE_ID,
          today: TODAY,
        }),
    };
  }

  function makeRow(overrides: Record<string, unknown> = {}) {
    return {
      endsOn: null,
      isActive: true,
      linkUrl: "/productos",
      startsOn: null,
      translations: [
        { locale: "es", shortText: "Feria", text: "Encontranos en la feria" },
        { locale: "en", shortText: null, text: "Find us at the fair" },
      ],
      ...overrides,
    };
  }

  test("answers the words in the page's language, the link and the short line, for the store's row", async () => {
    const { db, find } = setup(makeRow());

    await expect(find("en")).resolves.toEqual({
      href: "/productos",
      lang: "en",
      shortText: null,
      text: "Find us at the fair",
    });
    const [query] = db.query.announcement.findFirst.mock.calls[0] ?? [];
    expect(renderQuery((query as { where: unknown }).where)).toEqual({
      params: [STORE_ID],
      sql: '"announcement"."storeId" = $1',
    });
  });

  test("falls back to the language it has", async () => {
    const { find } = setup(
      makeRow({
        translations: [{ locale: "es", shortText: null, text: "Hola" }],
      })
    );

    await expect(find("en")).resolves.toEqual({
      href: "/productos",
      lang: "es",
      shortText: null,
      text: "Hola",
    });
  });

  test.each([
    ["none written", undefined],
    ["switched off", makeRow({ isActive: false })],
    ["ended yesterday", makeRow({ endsOn: "2026-12-03" })],
    ["starting tomorrow", makeRow({ startsOn: "2026-12-05" })],
    ["with no words", makeRow({ translations: [] })],
  ])("answers null when %s", async (_case, found) => {
    const { find } = setup(found);

    await expect(find("es")).resolves.toBeNull();
  });

  test("shows on its first and last days", async () => {
    const { find } = setup(
      makeRow({ endsOn: TODAY, startsOn: TODAY, translations: [] })
    );

    // No words, so null, but only because of them: with words it shows.
    await expect(find("es")).resolves.toBeNull();
    const { find: findWithWords } = setup(
      makeRow({ endsOn: TODAY, startsOn: TODAY })
    );
    await expect(findWithWords("es")).resolves.toMatchObject({
      text: "Encontranos en la feria",
    });
  });
});

describe("getHomeContent", () => {
  function setup() {
    const db = createMockDatabase();
    db.query.announcement.findFirst.mockResolvedValue({
      endsOn: null,
      isActive: true,
      linkUrl: null,
      startsOn: null,
      translations: [{ locale: "es", shortText: null, text: "Feria" }],
    });
    db.query.banner.findMany.mockResolvedValue([
      makeBannerRow({ id: 1 }),
      makeBannerRow({ coverPosition: 1, id: 2, startsOn: "2026-12-05" }),
      makeBannerRow({
        coverPosition: null,
        id: 3,
        imagePhoneHeight: 1067,
        imagePhoneUrl: "/seed/bubbles-1-phone.jpg",
        imagePhoneWidth: 850,
        linkProduct: { slug: "anillo-sello", status: "published" },
        linkProductId: 10,
        placement: "rows",
      }),
      makeBannerRow({
        coverPosition: null,
        id: 4,
        linkProduct: { slug: "borrador", status: "draft" },
        linkProductId: 11,
        placement: "rows",
      }),
      makeBannerRow({
        coverPosition: null,
        id: 6,
        isActive: false,
        placement: "rows",
      }),
    ]);
    db.query.category.findMany.mockResolvedValue([
      {
        id: 1,
        parentId: null,
        position: 0,
        showInHeader: true,
        slug: "anillos",
        translations: [{ locale: "es", name: "Anillos" }],
      },
      {
        id: 2,
        parentId: null,
        position: 1,
        showInHeader: true,
        slug: "relojes",
        translations: [{ locale: "es", name: "Relojes" }],
      },
    ]);
    db.query.homeSection.findMany.mockResolvedValue([
      { bannerId: 3, categoryId: null, kind: "banner" },
      { bannerId: 4, categoryId: null, kind: "banner" },
      { bannerId: 6, categoryId: null, kind: "banner" },
      { bannerId: null, categoryId: 1, kind: "category" },
      { bannerId: null, categoryId: 2, kind: "category" },
      // Rows the table's check would refuse: skipped.
      { bannerId: null, categoryId: null, kind: "category" },
      { bannerId: null, categoryId: null, kind: "banner" },
    ]);
    db.query.rankingEntry.findMany.mockResolvedValue([
      { productId: 21 },
      { productId: 20 },
      { productId: 99 },
    ]);
    db.query.featuredProduct.findMany.mockResolvedValue([{ productId: 22 }]);
    // Fourteen published articles in Anillos and one with no category.
    answerSelects(
      db,
      new Map([
        [
          product,
          [
            ...Array.from({ length: 14 }, (_unused, index) => ({
              categoryId: 1,
              id: 100 + index,
            })),
            { categoryId: null, id: 50 },
          ],
        ],
      ])
    );
    db.query.product.findMany.mockResolvedValue([
      ...Array.from({ length: 14 }, (_unused, index) =>
        makeProductRow(100 + index)
      ),
      makeProductRow(20),
      makeProductRow(21, { isAvailable: false }),
      makeProductRow(22),
    ]);

    return {
      db,
      read: async () =>
        await getHomeContent(db as never, {
          currencyCode: "UYU",
          locale: "es",
          storeId: STORE_ID,
          today: TODAY,
        }),
    };
  }

  test("reads in one read-only snapshot", async () => {
    const { db, read } = setup();

    await read();

    expect(db.$.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      { accessMode: "read only", isolationLevel: "repeatable read" }
    );
  });

  test("answers what the home shows now, filtered", async () => {
    const { read } = setup();

    const content = await read();

    expect(content.announcement).toEqual({
      href: null,
      lang: "es",
      shortText: null,
      text: "Feria",
    });
    // Banner 2 starts tomorrow.
    expect(content.cover).toEqual([
      {
        ctaLabel: "Mirá",
        href: null,
        id: 1,
        image: SEED_IMAGE,
        lang: "es",
        phoneImage: null,
        title: "Burbujas",
      },
    ]);
    expect(content.sections.map((section) => section.key)).toEqual([
      // The curated rows were never placed: first, and the featured one has
      // its one article; banner 6 is off; Relojes has no article.
      "best_sellers",
      "featured",
      "banner:3",
      "banner:4",
      "category:1",
    ]);
    const [bestSellers, featured, linked, unlinked, anillos] = content.sections;
    // A sold-out best seller and one no longer published drop out.
    expect(bestSellers).toEqual({
      articles: [makeCard(20)],
      key: "best_sellers",
      kind: "best_sellers",
    });
    expect(featured).toEqual({
      articles: [makeCard(22)],
      key: "featured",
      kind: "featured",
    });
    expect(linked).toEqual({
      banner: {
        ctaLabel: "Mirá",
        href: "/productos/anillo-sello",
        id: 3,
        image: SEED_IMAGE,
        lang: "es",
        phoneImage: {
          height: 1067,
          url: "/seed/bubbles-1-phone.jpg",
          width: 850,
        },
        title: "Burbujas",
      },
      key: "banner:3",
      kind: "banner",
    });
    // A link to a draft would be a 404: the banner shows without it.
    expect(unlinked).toMatchObject({ banner: { href: null, id: 4 } });
    // The store's order, twelve at most.
    expect(anillos).toEqual({
      articles: Array.from({ length: 12 }, (_unused, index) =>
        makeCard(100 + index)
      ),
      category: { id: 1, lang: "es", name: "Anillos", path: "/anillos" },
      key: "category:1",
      kind: "category",
    });
  });

  test("reads only the store's published articles, in its own order", async () => {
    const { db, read } = setup();

    await read();

    const [where] = db.$["select.where"].mock.calls[0] ?? [];
    expect(renderQuery(where)).toEqual({
      params: [STORE_ID, "published"],
      sql: '("product"."storeId" = $1 and "product"."status" = $2)',
    });
    expect(readsOf(db).tables).toEqual([product]);
    // The first twelve of each category are the store's first twelve.
    expect(
      db.$["select.orderBy"].mock.calls.map((terms) => renderOrderBy(terms))
    ).toEqual(['"product"."position" asc, "product"."id" asc']);
  });

  test("an empty store's home holds nothing", async () => {
    const db = createMockDatabase();

    await expect(
      getHomeContent(db as never, {
        currencyCode: "UYU",
        locale: "en",
        storeId: STORE_ID,
        today: TODAY,
      })
    ).resolves.toEqual({ announcement: null, cover: [], sections: [] });
  });

  test("leads a banner to its category's page under its group, or to its address", async () => {
    const { db, read } = setup();
    db.query.banner.findMany.mockResolvedValue([
      makeBannerRow({
        id: 1,
        linkCategory: { parent: { slug: "bijouterie" }, slug: "anillos" },
        linkCategoryId: 1,
      }),
      makeBannerRow({
        coverPosition: 1,
        id: 2,
        linkCategory: { parent: null, slug: "burbujeros" },
        linkCategoryId: 2,
      }),
      makeBannerRow({
        coverPosition: 2,
        id: 3,
        linkUrl: "https://instagram.com/lr",
        translations: [],
      }),
    ]);

    const { cover } = await read();

    expect(cover.map(({ href, title }) => ({ href, title }))).toEqual([
      { href: "/bijouterie/anillos", title: "Burbujas" },
      { href: "/burbujeros", title: "Burbujas" },
      // No words at all: an empty title, in the page's language.
      { href: "https://instagram.com/lr", title: "" },
    ]);
  });
});

describe("getHomeCuration", () => {
  function setup({ currency = true }: { currency?: boolean } = {}) {
    const db = createMockDatabase();
    answerSelects(
      db,
      new Map(currency ? [[store, [{ currencyCode: "UYU" }]]] : [])
    );
    db.query.announcement.findFirst.mockResolvedValue({
      endsOn: "2027-01-05",
      isActive: true,
      linkUrl: "/productos",
      startsOn: null,
      translations: [
        { locale: "es", shortText: "Feria", text: "Encontranos" },
        { locale: "en", shortText: null, text: "Find us" },
      ],
    });
    db.query.banner.findMany.mockResolvedValue([
      makeBannerRow({ id: 1 }),
      makeBannerRow({
        coverPosition: null,
        id: 2,
        imagePhoneHeight: 800,
        imagePhoneUrl: "/seed/ring-3-phone.jpg",
        imagePhoneWidth: 800,
        linkProduct: { slug: "anillo", status: "draft" },
        linkProductId: 10,
        placement: "rows",
        translations: [{ ctaLabel: null, locale: "es", title: "Anillos" }],
      }),
      makeBannerRow({
        coverPosition: 1,
        id: 3,
        linkCategory: { parent: null, slug: "aros" },
        linkCategoryId: 4,
      }),
      makeBannerRow({ coverPosition: 2, id: 4, linkUrl: "/productos" }),
      makeBannerRow({ coverPosition: 3, id: 6, translations: [] }),
    ]);
    db.query.category.findMany.mockResolvedValue([
      {
        id: 3,
        parentId: null,
        slug: "bijouterie",
        translations: [
          { locale: "es", name: "Bijouterie" },
          { locale: "en", name: "Jewelry" },
        ],
      },
      { id: 4, parentId: 3, slug: "aros", translations: [] },
      // Its group is not in the list (a stale read): a page of its own.
      { id: 5, parentId: 99, slug: "sueltos", translations: [] },
    ]);
    db.query.product.findMany.mockResolvedValue([
      {
        categoryId: 4,
        id: 10,
        images: [SEED_IMAGE],
        isAvailable: true,
        priceAmount: 990,
        slug: "anillo",
        status: "draft",
        translations: [
          { locale: "es", title: "Anillo" },
          { locale: "en", title: "Ring" },
        ],
      },
      {
        categoryId: null,
        id: 11,
        images: [],
        isAvailable: false,
        priceAmount: null,
        slug: "articulo",
        status: "draft",
        translations: [],
      },
    ]);
    db.query.homeSection.findMany.mockResolvedValue([
      { bannerId: null, categoryId: 4, kind: "category" },
      { bannerId: 2, categoryId: null, kind: "banner" },
    ]);
    db.query.rankingEntry.findMany.mockResolvedValue([{ productId: 10 }]);
    db.query.featuredProduct.findMany.mockResolvedValue([]);

    return {
      db,
      read: async () =>
        await getHomeCuration(db as never, { storeId: STORE_ID, today: TODAY }),
    };
  }

  test("answers everything the screen edits, in both languages", async () => {
    const { db, read } = setup();

    const curation = await read();

    expect(curation).toEqual({
      announcement: {
        endsOn: "2027-01-05",
        isActive: true,
        linkUrl: "/productos",
        shortTextEn: null,
        shortTextEs: "Feria",
        startsOn: null,
        textEn: "Find us",
        textEs: "Encontranos",
      },
      articles: [
        {
          categoryId: 4,
          id: 10,
          image: SEED_IMAGE,
          isAvailable: true,
          priceAmount: 990,
          slug: "anillo",
          status: "draft",
          titleEn: "Ring",
          titleEs: "Anillo",
        },
        {
          categoryId: null,
          id: 11,
          image: null,
          isAvailable: false,
          priceAmount: null,
          slug: "articulo",
          status: "draft",
          titleEn: null,
          titleEs: "",
        },
      ],
      banners: [
        expect.objectContaining({
          ctaLabelEn: null,
          ctaLabelEs: "Mirá",
          href: null,
          id: 1,
          image: SEED_IMAGE,
          imagePhone: null,
          link: { kind: "none" },
          placement: "cover",
          titleEn: "Bubbles",
          titleEs: "Burbujas",
        }),
        {
          ctaLabelEn: null,
          ctaLabelEs: null,
          endsOn: null,
          href: null,
          id: 2,
          image: SEED_IMAGE,
          imagePhone: {
            height: 800,
            url: "/seed/ring-3-phone.jpg",
            width: 800,
          },
          isActive: true,
          link: { kind: "product", productId: 10 },
          placement: "rows",
          startsOn: null,
          titleEn: null,
          titleEs: "Anillos",
        },
        expect.objectContaining({
          href: "/aros",
          id: 3,
          link: { categoryId: 4, kind: "category" },
        }),
        expect.objectContaining({
          href: "/productos",
          id: 4,
          link: { kind: "url", url: "/productos" },
        }),
        expect.objectContaining({ id: 6, titleEn: null, titleEs: "" }),
      ],
      categories: [
        { id: 3, nameEn: "Jewelry", nameEs: "Bijouterie", path: "/bijouterie" },
        { id: 4, nameEn: null, nameEs: "", path: "/bijouterie/aros" },
        { id: 5, nameEn: null, nameEs: "", path: "/sueltos" },
      ],
      coverBannerIds: [1, 3, 4, 6],
      currencyCode: "UYU",
      featuredProductIds: [],
      rankingProductIds: [10],
      sections: [
        { kind: "best_sellers" },
        { kind: "featured" },
        { categoryId: 4, kind: "category" },
        { bannerId: 2, kind: "banner" },
        { categoryId: 3, kind: "category" },
        { categoryId: 5, kind: "category" },
      ],
      today: TODAY,
    });
    expect(db.$.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      { accessMode: "read only", isolationLevel: "repeatable read" }
    );
    const [where] = db.$["select.where"].mock.calls[0] ?? [];
    expect(renderQuery(where)).toEqual({
      params: [STORE_ID],
      sql: '"store"."id" = $1',
    });
  });

  test("answers a null announcement before one is written", async () => {
    const { db, read } = setup();
    db.query.announcement.findFirst.mockResolvedValue(undefined);

    await expect(read()).resolves.toMatchObject({ announcement: null });
  });

  test("an announcement with no Spanish row reads as an empty text", async () => {
    const { db, read } = setup();
    db.query.announcement.findFirst.mockResolvedValue({
      endsOn: null,
      isActive: false,
      linkUrl: null,
      startsOn: null,
      translations: [],
    });

    await expect(read()).resolves.toMatchObject({
      announcement: {
        shortTextEn: null,
        shortTextEs: null,
        textEn: null,
        textEs: "",
      },
    });
  });

  test("refuses a store that does not exist", async () => {
    const { read } = setup({ currency: false });

    await expect(read()).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
  });
});

function makeAnnouncementValues(
  overrides: Partial<SaveAnnouncementValues> = {}
): SaveAnnouncementValues {
  return {
    endsOn: "2027-01-05",
    isActive: true,
    linkUrl: "/productos",
    shortTextEn: "Fair",
    shortTextEs: "Feria",
    startsOn: "2026-12-05",
    textEn: "Find us",
    textEs: "Encontranos",
    ...overrides,
  };
}

describe("saveAnnouncement", () => {
  function setup({ saved = [{ id: 3 }] }: { saved?: { id: number }[] } = {}) {
    const db = createMockDatabase();
    db.$["insert.returning"].mockResolvedValue(saved);

    return {
      db,
      save: async (values = makeAnnouncementValues()) =>
        await saveAnnouncement(db as never, { storeId: STORE_ID, values }),
    };
  }

  test("takes the home's lock, then upserts the store's one announcement and its words in both languages", async () => {
    const { db, save } = setup();

    await expect(save()).resolves.toEqual({ id: 3 });

    expect(renderQuery(db.$.execute.mock.calls[0]?.[0]).params).toEqual([
      "home:7",
    ]);
    expect(db.$.insert.mock.calls.map(([table]) => table)).toEqual([
      announcement,
      announcementTranslation,
    ]);
    const columns = {
      endsOn: "2027-01-05",
      isActive: true,
      linkUrl: "/productos",
      startsOn: "2026-12-05",
    };
    expect(db.$["insert.values"].mock.calls).toEqual([
      [{ ...columns, storeId: STORE_ID }],
      [
        [
          {
            announcementId: 3,
            locale: "es",
            shortText: "Feria",
            text: "Encontranos",
          },
          {
            announcementId: 3,
            locale: "en",
            shortText: "Fair",
            text: "Find us",
          },
        ],
      ],
    ]);
    const [first, second] = db.$["insert.onConflictDoUpdate"].mock.calls;
    expect(first?.[0]).toMatchObject({
      set: columns,
      target: announcement.storeId,
    });
    expect(second?.[0]).toMatchObject({
      target: [
        announcementTranslation.announcementId,
        announcementTranslation.locale,
      ],
    });
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("without an English text, writes the Spanish and deletes the English row", async () => {
    const { db, save } = setup();

    await save(makeAnnouncementValues({ shortTextEn: null, textEn: null }));

    expect(db.$["insert.values"].mock.calls[1]?.[0]).toEqual([
      {
        announcementId: 3,
        locale: "es",
        shortText: "Feria",
        text: "Encontranos",
      },
    ]);
    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(
      announcementTranslation
    );
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [3, "en"],
      sql: '("announcement_translation"."announcementId" = $1 and "announcement_translation"."locale" = $2)',
    });
  });

  test("throws when the upsert answers no row", async () => {
    const { save } = setup({ saved: [] });

    await expect(save()).rejects.toThrow(
      "Saving the announcement returned no row"
    );
  });
});

function makeCreateValues(
  overrides: Partial<CreateBannerValues> = {}
): CreateBannerValues {
  return {
    ctaLabelEn: null,
    ctaLabelEs: "Mirá",
    endsOn: null,
    image: makeUpload(),
    imagePhone: null,
    isActive: true,
    link: { kind: "none" },
    placement: "cover",
    startsOn: null,
    titleEn: "Bubbles",
    titleEs: "Burbujas",
    ...overrides,
  };
}

/** The lock's reads: the store's categories, the articles named, the banners. */
function makeTargets({
  banners = [
    {
      coverPosition: 0,
      id: 1,
      imagePhoneUrl: null,
      imageUrl: "/a.jpg",
      placement: "cover",
    },
    {
      coverPosition: 4,
      id: 2,
      imagePhoneUrl: null,
      imageUrl: "/b.jpg",
      placement: "cover",
    },
    {
      coverPosition: null,
      id: 3,
      imagePhoneUrl: null,
      imageUrl: "/c.jpg",
      placement: "rows",
    },
  ],
  categories = [{ id: 11 }, { id: 12 }],
  products = [{ id: 40 }],
}: {
  banners?: Record<string, unknown>[];
  categories?: { id: number }[];
  products?: { id: number }[];
} = {}) {
  return new Map<unknown, unknown[]>([
    [banner, banners],
    [category, categories],
    [product, products],
  ]);
}

/** `count` banners in the cover, ids 101 on, then banner 3 between rows. */
function makeCoverBanners(count: number) {
  return [
    ...Array.from({ length: count }, (_unused, index) => ({
      coverPosition: index,
      id: 101 + index,
      imagePhoneUrl: null,
      imageUrl: "/a.jpg",
      placement: "cover",
    })),
    {
      coverPosition: null,
      id: 3,
      imagePhoneUrl: null,
      imageUrl: "/seed/c.jpg",
      placement: "rows",
    },
  ];
}

describe("createBanner", () => {
  function setup({
    created = [{ id: 9 }],
    saved = [],
    targets = makeTargets(),
  }: {
    created?: { id: number }[];
    saved?: Record<string, unknown>[];
    targets?: Map<unknown, unknown[]>;
  } = {}) {
    const db = createMockDatabase();
    answerSelects(db, targets);
    db.$["insert.returning"].mockResolvedValue(created);
    db.query.homeSection.findMany.mockResolvedValue(saved);

    return {
      create: async (
        values: CreateBannerValues,
        blobStore: BlobStore | null = BLOB_STORE
      ) =>
        await createBanner(db as never, {
          blobStore,
          storeId: STORE_ID,
          values,
        }),
      db,
    };
  }

  test("puts a cover banner last in the carousel, with its photos, link and words", async () => {
    const { create, db } = setup();
    const values = makeCreateValues({
      imagePhone: makeUpload(),
      link: { categoryId: 12, kind: "category" },
    });

    await expect(create(values)).resolves.toEqual({ id: 9 });

    expect(readsOf(db)).toEqual({
      locks: ["key share"],
      tables: [category, banner],
    });
    expect(db.$["insert.values"].mock.calls[0]?.[0]).toEqual({
      coverPosition: 5,
      endsOn: null,
      imageHeight: 1067,
      imagePhoneHeight: 1067,
      imagePhoneUrl: values.imagePhone?.url,
      imagePhoneWidth: 1600,
      imageUrl: values.image.url,
      imageWidth: 1600,
      isActive: true,
      linkCategoryId: 12,
      linkProductId: null,
      linkUrl: null,
      placement: "cover",
      startsOn: null,
      storeId: STORE_ID,
    });
    expect(db.$["insert.values"].mock.calls[1]?.[0]).toEqual([
      { bannerId: 9, ctaLabel: "Mirá", locale: "es", title: "Burbujas" },
      { bannerId: 9, ctaLabel: null, locale: "en", title: "Bubbles" },
    ]);
    expect(db.$["insert.onConflictDoUpdate"].mock.calls[0]?.[0]).toMatchObject({
      target: [bannerTranslation.bannerId, bannerTranslation.locale],
    });
    // A cover banner has no place in the sequence.
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("the first cover banner goes at 0", async () => {
    const { create, db } = setup({ targets: makeTargets({ banners: [] }) });

    await create(makeCreateValues());

    expect(db.$["insert.values"].mock.calls[0]?.[0]).toMatchObject({
      coverPosition: 0,
    });
  });

  test("puts a banner between rows at the place chosen, rewriting the sequence", async () => {
    const { create, db } = setup({
      saved: [
        { bannerId: null, categoryId: null, kind: "best_sellers" },
        { bannerId: null, categoryId: 11, kind: "category" },
        { bannerId: 3, categoryId: null, kind: "banner" },
        { bannerId: null, categoryId: null, kind: "featured" },
      ],
    });

    await create(
      makeCreateValues({
        link: { kind: "url", url: "/productos" },
        placement: "rows",
        rowsIndex: 2,
        titleEn: null,
      })
    );

    expect(db.$["insert.values"].mock.calls[0]?.[0]).toMatchObject({
      coverPosition: null,
      linkUrl: "/productos",
      placement: "rows",
    });
    // Only Spanish words: the English row goes.
    expect(db.$["insert.values"].mock.calls[1]?.[0]).toEqual([
      { bannerId: 9, ctaLabel: "Mirá", locale: "es", title: "Burbujas" },
    ]);
    expect(db.$.delete.mock.calls.map(([table]) => table)).toEqual([
      bannerTranslation,
      homeSection,
    ]);
    expect(renderQuery(db.$["delete.where"].mock.calls[1]?.[0])).toEqual({
      params: [STORE_ID],
      sql: '"home_section"."storeId" = $1',
    });
    expect(db.$["insert.values"].mock.calls[2]?.[0]).toEqual([
      {
        bannerId: null,
        categoryId: null,
        kind: "best_sellers",
        position: 0,
        storeId: STORE_ID,
      },
      {
        bannerId: null,
        categoryId: 11,
        kind: "category",
        position: 1,
        storeId: STORE_ID,
      },
      {
        bannerId: 9,
        categoryId: null,
        kind: "banner",
        position: 2,
        storeId: STORE_ID,
      },
      {
        bannerId: 3,
        categoryId: null,
        kind: "banner",
        position: 3,
        storeId: STORE_ID,
      },
      {
        bannerId: null,
        categoryId: null,
        kind: "featured",
        position: 4,
        storeId: STORE_ID,
      },
      {
        bannerId: null,
        categoryId: 12,
        kind: "category",
        position: 5,
        storeId: STORE_ID,
      },
    ]);
  });

  test("with no place given, a banner between rows goes after the first row", async () => {
    const { create, db } = setup({
      targets: makeTargets({ banners: [], categories: [] }),
    });

    await create(makeCreateValues({ placement: "rows" }));

    expect(insertedRows(db, 2).map((row) => row.kind)).toEqual([
      "best_sellers",
      "banner",
      "featured",
    ]);
  });

  test("locks the article it links to and accepts it when it is the store's", async () => {
    const { create, db } = setup();

    await create(
      makeCreateValues({ link: { kind: "product", productId: 40 } })
    );

    expect(readsOf(db)).toEqual({
      locks: ["key share", "key share"],
      tables: [category, product, banner],
    });
    expect(renderQuery(db.$["select.where"].mock.calls[1]?.[0])).toEqual({
      params: [STORE_ID, 40],
      sql: '("product"."storeId" = $1 and "product"."id" in ($2))',
    });
    expect(db.$["insert.values"].mock.calls[0]?.[0]).toMatchObject({
      linkProductId: 40,
    });
  });

  test.each([
    [{ kind: "product", productId: 41 }, "Article not found"],
    [{ categoryId: 13, kind: "category" }, "Category not found"],
  ] as const)(
    "refuses a link to %o the store does not have",
    async (link, message) => {
      const { create, db } = setup();

      await expect(create(makeCreateValues({ link }))).rejects.toMatchObject({
        code: "NOT_FOUND",
        message,
      });
      expect(db.$.insert).not.toHaveBeenCalled();
    }
  );

  test.each([
    [
      "a photo from another site",
      {
        image: {
          ...makeUpload(),
          url: "https://evil.example/qa/banner/a.webp",
        },
      },
    ],
    ["a cover's upload", { image: makeUpload("cover") }],
    [
      "a phone photo from another site",
      {
        imagePhone: {
          ...makeUpload(),
          url: `https://${HOST}/production/banner/${randomUUID()}.webp`,
        },
      },
    ],
  ])("refuses %s before taking any lock", async (_case, overrides) => {
    const { create, db } = setup();

    await expect(create(makeCreateValues(overrides))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A banner photo must be one uploaded to this store",
    });
    expect(db.$.execute).not.toHaveBeenCalled();
  });

  test("refuses every photo where no Blob store is configured", async () => {
    const { create } = setup();

    await expect(create(makeCreateValues(), null)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A banner photo must be one uploaded to this store",
    });
  });

  test("a cover of five banners takes a sixth, last", async () => {
    const { create, db } = setup({
      targets: makeTargets({ banners: makeCoverBanners(5) }),
    });

    await expect(create(makeCreateValues())).resolves.toEqual({ id: 9 });
    expect(db.$["insert.values"].mock.calls[0]?.[0]).toMatchObject({
      coverPosition: 5,
      placement: "cover",
    });
  });

  test("a cover of six banners refuses a seventh, writing nothing", async () => {
    const { create, db } = setup({
      targets: makeTargets({ banners: makeCoverBanners(6) }),
    });

    await expect(create(makeCreateValues())).rejects.toMatchObject({
      code: "CONFLICT",
      message: "The cover holds at most 6 banners",
    });
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("a full cover still takes a banner between rows", async () => {
    const { create } = setup({
      targets: makeTargets({ banners: makeCoverBanners(6) }),
    });

    await expect(
      create(makeCreateValues({ placement: "rows" }))
    ).resolves.toEqual({ id: 9 });
  });

  test("throws when the insert answers no row", async () => {
    const { create } = setup({ created: [] });

    await expect(create(makeCreateValues())).rejects.toThrow(
      "Inserting a banner returned no row"
    );
  });
});

function makeUpdateValues(
  overrides: Partial<UpdateBannerValues> = {}
): UpdateBannerValues {
  return {
    ctaLabelEn: null,
    ctaLabelEs: null,
    endsOn: null,
    id: 3,
    isActive: true,
    link: { kind: "none" },
    placement: "rows",
    startsOn: null,
    titleEn: null,
    titleEs: "Burbujas",
    ...overrides,
  };
}

describe("updateBanner", () => {
  const STORED_PHONE = `https://${HOST}/qa/banner/${randomUUID()}.webp`;

  function setup({
    banners = [
      {
        coverPosition: 2,
        id: 1,
        imagePhoneUrl: null,
        imageUrl: "/a.jpg",
        placement: "cover",
      },
      {
        coverPosition: null,
        id: 3,
        imagePhoneUrl: STORED_PHONE,
        imageUrl: "/seed/c.jpg",
        placement: "rows",
      },
    ],
    saved = [
      { bannerId: null, categoryId: 11, kind: "category" },
      { bannerId: 3, categoryId: null, kind: "banner" },
    ],
  }: {
    banners?: Record<string, unknown>[];
    saved?: Record<string, unknown>[];
  } = {}) {
    const db = createMockDatabase();
    answerSelects(db, makeTargets({ banners }));
    db.query.homeSection.findMany.mockResolvedValue(saved);

    return {
      db,
      update: async (values: UpdateBannerValues) =>
        await updateBanner(db as never, {
          blobStore: BLOB_STORE,
          storeId: STORE_ID,
          values,
        }),
    };
  }

  /** What the update's `set` received. */
  function setOf(db: MockDatabase) {
    return db.$["update.set"].mock.calls[0]?.[0];
  }

  test("keeps its photos and its place when they are left out", async () => {
    const { db, update } = setup();

    await expect(update(makeUpdateValues())).resolves.toEqual({
      discardedImageUrls: [],
      id: 3,
    });

    expect(setOf(db)).toEqual({
      coverPosition: null,
      endsOn: null,
      isActive: true,
      linkCategoryId: null,
      linkProductId: null,
      linkUrl: null,
      placement: "rows",
      startsOn: null,
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [3, STORE_ID],
      sql: '("banner"."id" = $1 and "banner"."storeId" = $2)',
    });
    // Its words only: the sequence is not rewritten.
    expect(db.$.delete.mock.calls.map(([table]) => table)).toEqual([
      bannerTranslation,
    ]);
  });

  test("replaces its photo and removes its phone one, answering both old files", async () => {
    const { db, update } = setup();
    const image = makeUpload();

    await expect(
      update(makeUpdateValues({ image, imagePhone: null }))
    ).resolves.toEqual({
      discardedImageUrls: ["/seed/c.jpg", STORED_PHONE],
      id: 3,
    });
    expect(setOf(db)).toMatchObject({
      imageHeight: 1067,
      imagePhoneHeight: null,
      imagePhoneUrl: null,
      imagePhoneWidth: null,
      imageUrl: image.url,
      imageWidth: 1600,
    });
  });

  test("accepts its stored photos sent back unchanged", async () => {
    const { update } = setup();

    await expect(
      update(
        makeUpdateValues({
          image: { ...SEED_IMAGE, url: "/seed/c.jpg" },
          imagePhone: { height: 800, url: STORED_PHONE, width: 800 },
        })
      )
    ).resolves.toEqual({ discardedImageUrls: [], id: 3 });
  });

  test.each([
    [
      "a photo from elsewhere",
      { image: { ...SEED_IMAGE, url: "https://evil.example/x.webp" } },
    ],
    [
      "a phone photo from elsewhere",
      { imagePhone: { ...SEED_IMAGE, url: "/seed/other.jpg" } },
    ],
  ])("refuses %s", async (_case, overrides) => {
    const { db, update } = setup();

    await expect(update(makeUpdateValues(overrides))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A banner photo must be one uploaded to this store",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("refuses a banner the store does not have", async () => {
    const { db, update } = setup();

    await expect(update(makeUpdateValues({ id: 8 }))).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Banner not found",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("refuses a link to a category the store does not have", async () => {
    const { update } = setup();

    await expect(
      update(makeUpdateValues({ link: { categoryId: 99, kind: "category" } }))
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Category not found",
    });
  });

  test("moved into the cover, goes last there and leaves the sequence", async () => {
    const { db, update } = setup();

    await update(makeUpdateValues({ placement: "cover" }));

    expect(setOf(db)).toMatchObject({ coverPosition: 3, placement: "cover" });
    expect(db.$.delete.mock.calls.map(([table]) => table)).toEqual([
      bannerTranslation,
      homeSection,
    ]);
    expect(renderQuery(db.$["delete.where"].mock.calls[1]?.[0])).toEqual({
      params: [STORE_ID, 3],
      sql: '("home_section"."storeId" = $1 and "home_section"."bannerId" = $2)',
    });
  });

  test("moved into a cover of five banners, goes sixth", async () => {
    const { db, update } = setup({ banners: makeCoverBanners(5) });

    await expect(
      update(makeUpdateValues({ placement: "cover" }))
    ).resolves.toEqual({ discardedImageUrls: [], id: 3 });
    expect(setOf(db)).toMatchObject({ coverPosition: 5, placement: "cover" });
  });

  test("moved into a cover of six banners, is refused, writing nothing", async () => {
    const { db, update } = setup({ banners: makeCoverBanners(6) });

    await expect(
      update(makeUpdateValues({ placement: "cover" }))
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "The cover holds at most 6 banners",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("already in a full cover, is edited there", async () => {
    const { db, update } = setup({ banners: makeCoverBanners(6) });

    await expect(
      update(makeUpdateValues({ id: 106, placement: "cover" }))
    ).resolves.toEqual({ discardedImageUrls: [], id: 106 });
    expect(setOf(db)).toMatchObject({ coverPosition: 5, placement: "cover" });
  });

  test("kept in the cover, keeps its place in the carousel", async () => {
    const { db, update } = setup();

    await update(makeUpdateValues({ id: 1, placement: "cover" }));

    expect(setOf(db)).toMatchObject({ coverPosition: 2 });
    expect(db.$.delete.mock.calls.map(([table]) => table)).toEqual([
      bannerTranslation,
    ]);
  });

  test("moved between rows, takes the place chosen", async () => {
    const { db, update } = setup();

    await update(makeUpdateValues({ id: 1, rowsIndex: 0 }));

    expect(setOf(db)).toMatchObject({ coverPosition: null, placement: "rows" });
    expect(
      insertedRows(db, 1).map((row) => [
        row.kind,
        row.bannerId ?? row.categoryId,
      ])
    ).toEqual([
      ["banner", 1],
      // Never placed, the curated rows come first.
      ["best_sellers", null],
      ["featured", null],
      ["category", 11],
      ["banner", 3],
      ["category", 12],
    ]);
  });

  test("moved between rows with no place given, goes after the first row", async () => {
    const { db, update } = setup({ saved: [] });

    await update(makeUpdateValues({ id: 1 }));

    expect(insertedRows(db, 1).map((row) => row.bannerId ?? row.kind)).toEqual([
      "best_sellers",
      1,
      "featured",
      "category",
      "category",
      3,
    ]);
  });

  test("between rows with a new place, moves there", async () => {
    const { db, update } = setup();

    await update(makeUpdateValues({ rowsIndex: 0 }));

    expect(insertedRows(db, 1)[0]).toEqual({
      bannerId: 3,
      categoryId: null,
      kind: "banner",
      position: 0,
      storeId: STORE_ID,
    });
  });
});

describe("deleteBanner", () => {
  function setup(deleted: Record<string, unknown>[]) {
    const db = createMockDatabase();
    db.$["delete.returning"].mockResolvedValue(deleted);

    return {
      db,
      remove: async () =>
        await deleteBanner(db as never, { id: 3, storeId: STORE_ID }),
    };
  }

  test("deletes the store's banner after the home's lock, answering its photos", async () => {
    const { db, remove } = setup([
      {
        id: 3,
        imagePhoneUrl: "https://x/p.webp",
        imageUrl: "https://x/c.webp",
      },
    ]);

    await expect(remove()).resolves.toEqual({
      discardedImageUrls: ["https://x/c.webp", "https://x/p.webp"],
      id: 3,
    });
    const [lock] = db.$.execute.mock.calls[0] ?? [];
    expect(renderQuery(lock)).toEqual({
      params: [`home:${String(STORE_ID)}`],
      sql: "select pg_advisory_xact_lock(hashtext($1))",
    });
    expect(db.$.execute).toHaveBeenCalledOnce();
    // The lock comes first: the delete never runs without it.
    expect(db.$.execute.mock.invocationCallOrder[0]).toBeLessThan(
      db.$.delete.mock.invocationCallOrder[0] ?? 0
    );
    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(banner);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [3, STORE_ID],
      sql: '("banner"."id" = $1 and "banner"."storeId" = $2)',
    });
  });

  test("answers only the photos it had", async () => {
    const { remove } = setup([
      { id: 3, imagePhoneUrl: null, imageUrl: "/seed/c.jpg" },
    ]);

    await expect(remove()).resolves.toEqual({
      discardedImageUrls: ["/seed/c.jpg"],
      id: 3,
    });
  });

  test("refuses a banner the store does not have", async () => {
    const { remove } = setup([]);

    await expect(remove()).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Banner not found",
    });
  });
});

function makeLayoutValues(
  overrides: Partial<SaveHomeLayoutValues> = {}
): SaveHomeLayoutValues {
  return {
    coverBannerIds: [2],
    featuredProductIds: [40, 41],
    rankingProductIds: [41],
    sections: [
      { categoryId: 12, kind: "category" },
      { bannerId: 3, kind: "banner" },
      { kind: "featured" },
    ],
    ...overrides,
  };
}

describe("saveHomeLayout", () => {
  function setup() {
    const db = createMockDatabase();
    answerSelects(db, makeTargets({ products: [{ id: 40 }, { id: 41 }] }));

    return {
      db,
      save: async (values: SaveHomeLayoutValues) =>
        await saveHomeLayout(db as never, { storeId: STORE_ID, values }),
    };
  }

  test("saves the whole order: the sequence (what was left out after it), the cover, the best sellers and the featured", async () => {
    const { db, save } = setup();

    await expect(save(makeLayoutValues())).resolves.toEqual({
      coverBannerIds: [2, 1],
      featuredProductIds: [40, 41],
      rankingProductIds: [41],
      sections: [
        { kind: "best_sellers" },
        { categoryId: 12, kind: "category" },
        { bannerId: 3, kind: "banner" },
        { kind: "featured" },
        { categoryId: 11, kind: "category" },
      ],
    });

    expect(readsOf(db)).toEqual({
      locks: ["key share", "key share"],
      tables: [category, product, banner],
    });
    expect(db.$.delete.mock.calls.map(([table]) => table)).toEqual([
      homeSection,
      rankingEntry,
      featuredProduct,
    ]);
    expect(db.$.insert.mock.calls.map(([table]) => table)).toEqual([
      homeSection,
      rankingEntry,
      featuredProduct,
    ]);
    expect(db.$["insert.values"].mock.calls.slice(1)).toEqual([
      [[{ position: 0, productId: 41, storeId: STORE_ID }]],
      [
        [
          { position: 0, productId: 40, storeId: STORE_ID },
          { position: 1, productId: 41, storeId: STORE_ID },
        ],
      ],
    ]);
    expect(
      renderQuery(insertedRows(db, 0, "update.set")[0]?.coverPosition)
    ).toEqual({
      params: [2, 0, 1, 1],
      sql: 'case "banner"."id" when $1 then $2::int when $3 then $4::int end',
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [STORE_ID, 2, 1],
      sql: '("banner"."storeId" = $1 and "banner"."id" in ($2, $3))',
    });
  });

  test("empties the curated rows and leaves no cover order to write", async () => {
    const { db, save } = setup();
    answerSelects(db, makeTargets({ banners: [], products: [] }));

    await save(
      makeLayoutValues({
        coverBannerIds: [],
        featuredProductIds: [],
        rankingProductIds: [],
        sections: [],
      })
    );

    expect(readsOf(db).tables).toEqual([category, banner]);
    expect(db.$.update).not.toHaveBeenCalled();
    expect(db.$.insert.mock.calls.map(([table]) => table)).toEqual([
      homeSection,
    ]);
  });

  test.each<[string, Partial<SaveHomeLayoutValues>, string, string]>([
    [
      "an article the store does not have",
      { rankingProductIds: [42] },
      "NOT_FOUND",
      "Article not found",
    ],
    [
      "a category the store does not have",
      { sections: [{ categoryId: 99, kind: "category" }] },
      "NOT_FOUND",
      "Category not found",
    ],
    [
      "a banner the store does not have",
      { sections: [{ bannerId: 99, kind: "banner" }] },
      "NOT_FOUND",
      "Banner not found",
    ],
    [
      "a cover banner between rows",
      { sections: [{ bannerId: 2, kind: "banner" }] },
      "BAD_REQUEST",
      "That banner is in the cover, not between rows",
    ],
    [
      "a banner between rows in the cover",
      { coverBannerIds: [3] },
      "BAD_REQUEST",
      "That banner is between rows, not in the cover",
    ],
    [
      "an unknown cover banner",
      { coverBannerIds: [99] },
      "NOT_FOUND",
      "Banner not found",
    ],
  ])("refuses %s, writing nothing", async (_case, overrides, code, message) => {
    const { db, save } = setup();

    await expect(save(makeLayoutValues(overrides))).rejects.toMatchObject({
      code,
      message,
    });
    expect(db.$.delete).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });
});
