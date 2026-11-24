import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test, vi } from "vitest";

import {
  createBannerSchema,
  createSpotlightSchema,
  saveAnnouncementSchema,
} from "@/lib/schemas/page";
import {
  banner,
  bannerTranslation,
  category,
  featuredProduct,
  pageCoverBanner,
  pageSection,
  product,
  rankingEntry,
} from "@/server/db/schema";
import { createMockDatabase, type MockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { SEED_ARTICLES } from "./seed-articles";
import {
  SEED_ANNOUNCEMENT,
  SEED_BEST_SELLERS,
  SEED_COVER_BANNERS,
  SEED_FEATURED,
  SEED_ROW_BANNERS,
  SEED_SPOTLIGHT,
  seedHome,
} from "./seed-home";

const { createSpotlight, findHomePageId, lockStorePages, saveAnnouncement } =
  vi.hoisted(() => ({
    createSpotlight: vi.fn(async (_tx: unknown, _options: unknown) => ({
      id: 51,
    })),
    // The store's home is its page 3 (FER-058).
    findHomePageId: vi.fn(async (_tx: unknown, _scope: unknown) => 3),
    lockStorePages: vi.fn(async (_tx: unknown, _storeId: number) => undefined),
    saveAnnouncement: vi.fn(async (_tx: unknown, _options: unknown) => ({
      id: 1,
    })),
  }));

// The service's reads and writes are `src/server/services/page.test.ts`'s.
vi.mock("@/server/services/page", () => ({
  createSpotlight,
  findHomePageId,
  lockStorePages,
  saveAnnouncement,
}));

const STORE_ID = 7;

/** The seeded store's categories, in no particular order. */
const CATEGORIES = [
  { id: 1, slug: "burbujeros" },
  { id: 2, slug: "bijouterie" },
  { id: 3, slug: "cadenas" },
  { id: 4, slug: "anillos" },
  { id: 5, slug: "aros" },
  { id: 6, slug: "pulseras" },
];

/** A seeded article's row for each title, ids from 100 in title order. */
function articleRows(titles: readonly string[]) {
  return titles.map((title, index) => ({ id: 100 + index, title }));
}

/** The parts of a home the seed checks for before adding its own. */
const HOME_PARTS = [
  "announcement",
  "banner",
  "featuredProduct",
  "pageSection",
  "rankingEntry",
  "spotlight",
] as const;

type HomePart = (typeof HOME_PARTS)[number];

/**
 * A store with the parts `existing` names already there, the given categories
 * and articles; each banner insert answers the next id from 1.
 */
function setup({
  articles = articleRows([...SEED_BEST_SELLERS, ...SEED_FEATURED]),
  categories = CATEGORIES,
  existing = [],
}: {
  articles?: { id: number; title: string }[];
  categories?: { id: number; slug: string }[];
  existing?: readonly HomePart[];
} = {}) {
  const db = createMockDatabase();
  const read: { table: unknown } = { table: null };
  db.$["select.from"].mockImplementation((table: unknown) => {
    read.table = table;
  });
  db.$["select.where"].mockImplementation(
    async () =>
      await Promise.resolve(read.table === category ? categories : articles)
  );
  const ids = { next: 1 };
  db.$["insert.returning"].mockImplementation(async () => {
    const id = ids.next;
    ids.next += 1;
    return await Promise.resolve([{ id }]);
  });

  for (const model of existing) {
    // A saved order's last section is at place 9.
    db.query[model].findFirst.mockResolvedValue({ id: 9, position: 9 });
  }

  return { db, run: async () => await seedHome(db as never, STORE_ID) };
}

/** What each insert wrote, by table, in order. */
function insertsOf(db: MockDatabase) {
  return db.$.insert.mock.calls.map(([table], index) => ({
    table,
    values: db.$["insert.values"].mock.calls[index]?.[0],
  }));
}

/** The rows an insert received, as a list. */
function rowsOf(values: unknown): Record<string, unknown>[] {
  return Array.isArray(values)
    ? values.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null
      )
    : [];
}

/** A JPEG's size, from its first frame header. */
function jpegSize(file: string) {
  const bytes = readFileSync(path.join(process.cwd(), "public/seed", file));
  let offset = 2;

  while (offset + 9 < bytes.length) {
    const marker = bytes.readUInt16BE(offset);

    if (marker >= 0xff_c0 && marker <= 0xff_c3) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + bytes.readUInt16BE(offset + 2);
  }

  return null;
}

describe("seedHome", () => {
  test("on a store with none of it, adds the announcement, five banners placed on its home page, its order, the best sellers and the featured, under the pages' lock", async () => {
    const { db, run } = setup();

    await expect(run()).resolves.toEqual({
      announcement: true,
      banners: 5,
      featured: 4,
      ranking: 8,
      spotlight: true,
    });

    // The fish bubble gun (the first best seller, 100), through the
    // service as the admin adds one: right after its category's row, the
    // fourth place of the order below, never against "how to buy".
    expect(createSpotlight).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: STORE_ID,
      values: {
        ...SEED_SPOTLIGHT.words,
        pageId: 3,
        productId: 100,
        rowsIndex: 4,
      },
    });
    expect(lockStorePages).toHaveBeenCalledExactlyOnceWith(db, STORE_ID);
    expect(saveAnnouncement).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: STORE_ID,
      values: SEED_ANNOUNCEMENT,
    });
    const inserts = insertsOf(db);
    expect(inserts.map((insert) => insert.table)).toEqual([
      banner,
      bannerTranslation,
      banner,
      bannerTranslation,
      banner,
      bannerTranslation,
      banner,
      bannerTranslation,
      banner,
      bannerTranslation,
      pageCoverBanner,
      pageSection,
      rankingEntry,
      featuredProduct,
    ]);
    expect(findHomePageId).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: STORE_ID,
    });
    // The cover's three, in order, on the home page.
    expect(inserts[10]?.values).toEqual([
      { bannerId: 1, pageId: 3, position: 0 },
      { bannerId: 2, pageId: 3, position: 1 },
      { bannerId: 3, pageId: 3, position: 2 },
    ]);
    // The first cover banner, its phone crop and its category.
    expect(inserts[0]?.values).toEqual({
      imageHeight: 1067,
      imagePhoneHeight: 1067,
      imagePhoneUrl: "/seed/bubble-gun-2-phone.jpg",
      imagePhoneWidth: 854,
      imageUrl: "/seed/bubble-gun-2.jpg",
      imageWidth: 1600,
      isActive: true,
      linkCategoryId: 1,
      linkUrl: null,
      storeId: STORE_ID,
    });
    expect(inserts[3]?.values).toEqual([
      {
        bannerId: 2,
        ctaLabel: "Ver las joyas",
        locale: "es",
        title: "Joyas para regalar en las fiestas",
      },
      {
        bannerId: 2,
        ctaLabel: "See the jewelry",
        locale: "en",
        title: "Jewelry to give this season",
      },
    ]);
    // The fair's banner leads to the catalog; the earrings' has no phone crop.
    expect(inserts[6]?.values).toMatchObject({
      linkCategoryId: null,
      linkUrl: "/productos",
    });
    expect(inserts[8]?.values).toMatchObject({
      imagePhoneUrl: null,
      linkCategoryId: 5,
    });
    expect(rowsOf(inserts[11]?.values)[0]).toMatchObject({
      pageId: 3,
      storeId: STORE_ID,
    });
    expect(
      rowsOf(inserts[11]?.values).map((row) => [
        row.position,
        row.kind,
        row.bannerId ?? row.categoryId,
      ])
    ).toEqual([
      // "How to buy" opens the home, right under the cover (FER-076).
      [0, "how_to_buy", null],
      [1, "best_sellers", null],
      [2, "banner", 4],
      [3, "category", 1],
      [4, "featured", null],
      [5, "category", 3],
      [6, "category", 4],
      [7, "banner", 5],
      [8, "category", 5],
      [9, "category", 6],
      // Bijouterie, a group with no row of its own in the list, goes last.
      [10, "category", 2],
    ]);
    // A store with no banner and no order has nothing to replace.
    expect(db.$.delete).not.toHaveBeenCalled();
    expect(inserts[12]?.values).toEqual(
      SEED_BEST_SELLERS.map((_title, position) => ({
        position,
        productId: 100 + position,
        storeId: STORE_ID,
      }))
    );
    expect(inserts[13]?.values).toEqual(
      SEED_FEATURED.map((_title, position) => ({
        position,
        productId: 108 + position,
        storeId: STORE_ID,
      }))
    );
  });

  test("picks the curated articles by their Spanish titles, in the store", async () => {
    const { db, run } = setup();

    await run();

    const [spotlit] = db.$["select.where"].mock.calls[1] ?? [];
    expect(renderQuery(spotlit).params).toEqual([
      STORE_ID,
      "es",
      SEED_SPOTLIGHT.title,
    ]);
    const [where] = db.$["select.where"].mock.calls[2] ?? [];
    expect(renderQuery(where)).toEqual({
      params: [STORE_ID, "es", ...SEED_BEST_SELLERS],
      sql: expect.stringMatching(
        /^\("product"\."storeId" = \$1 and "product_translation"\."locale" = \$2 and "product_translation"\."title" in \(/u
      ),
    });
    expect(db.$["select.from"].mock.calls.map(([table]) => table)).toEqual([
      category,
      product,
      product,
      product,
    ]);
  });

  test("leaves a store that has all of it alone", async () => {
    const { db, run } = setup({ existing: HOME_PARTS });

    await expect(run()).resolves.toEqual({
      announcement: false,
      banners: 0,
      featured: 0,
      ranking: 0,
      spotlight: false,
    });
    expect(saveAnnouncement).not.toHaveBeenCalled();
    expect(createSpotlight).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("keeps an order the admin saved on a store with no banner, placing the banners between rows after it", async () => {
    const { db, run } = setup({
      existing: [
        "announcement",
        "featuredProduct",
        "pageSection",
        "rankingEntry",
      ],
    });

    await expect(run()).resolves.toEqual({
      announcement: false,
      banners: 5,
      featured: 0,
      ranking: 0,
      spotlight: true,
    });
    // The spotlight goes last, after the saved order and the banners placed
    // after it, which keep their places.
    expect(createSpotlight).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: STORE_ID,
      values: {
        ...SEED_SPOTLIGHT.words,
        pageId: 3,
        productId: 100,
        rowsIndex: Number.MAX_SAFE_INTEGER,
      },
    });
    const inserts = insertsOf(db);
    expect(inserts.map((insert) => insert.table)).toEqual([
      ...Array.from({ length: 5 }, () => [banner, bannerTranslation]).flat(),
      pageCoverBanner,
      pageSection,
    ]);
    // Banners 4 and 5 (the seed's two between rows) follow the saved
    // order's last place, 9; nothing else of the order is written.
    expect(inserts.at(-1)?.values).toEqual([
      {
        bannerId: 4,
        categoryId: null,
        kind: "banner",
        pageId: 3,
        position: 10,
        storeId: STORE_ID,
      },
      {
        bannerId: 5,
        categoryId: null,
        kind: "banner",
        pageId: 3,
        position: 11,
        storeId: STORE_ID,
      },
    ]);
    // The order looked for is the home page's, its last place first.
    const [config] = db.query.pageSection.findFirst.mock.calls[0] ?? [];
    const { orderBy, where } = config as { orderBy: unknown[]; where: unknown };
    expect(renderQuery(where)).toEqual({
      params: [3],
      sql: '"page_section"."pageId" = $1',
    });
    expect(orderBy.map((term) => renderQuery(term))).toEqual([
      { params: [], sql: '"page_section"."position" desc' },
    ]);
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("writes the order on a store that has banners but never saved one", async () => {
    const { db, run } = setup({
      existing: [
        "announcement",
        "banner",
        "featuredProduct",
        "rankingEntry",
        "spotlight",
      ],
    });

    await expect(run()).resolves.toEqual({
      announcement: false,
      banners: 0,
      featured: 0,
      ranking: 0,
      spotlight: false,
    });
    const inserts = insertsOf(db);
    expect(inserts.map((insert) => insert.table)).toEqual([pageSection]);
    // The seed's banners between rows are not this store's: left out.
    expect(
      rowsOf(inserts[0]?.values).map(
        (row) => row.bannerId ?? row.categoryId ?? row.kind
      )
    ).toEqual(["how_to_buy", "best_sellers", 1, "featured", 3, 4, 5, 6, 2]);
  });

  test("on a store missing some categories and articles, skips what it cannot find, and adds no featured row of one", async () => {
    const { db, run } = setup({
      articles: articleRows(["Par de esclavas"]),
      categories: [{ id: 1, slug: "burbujeros" }],
    });

    await expect(run()).resolves.toEqual({
      announcement: true,
      banners: 5,
      featured: 0,
      ranking: 0,
      spotlight: false,
    });
    // Without its article, no spotlight.
    expect(createSpotlight).not.toHaveBeenCalled();
    const inserts = insertsOf(db);
    expect(inserts.map((insert) => insert.table).slice(-1)).toEqual([
      pageSection,
    ]);
    // A banner whose category is missing has no link.
    expect(inserts[2]?.values).toMatchObject({ linkCategoryId: null });
    expect(rowsOf(inserts.at(-1)?.values).map((row) => row.kind)).toEqual([
      "how_to_buy",
      "best_sellers",
      "banner",
      "category",
      "featured",
      "banner",
    ]);
  });

  test('on a store without the spotlight\'s category, puts the spotlight right after "how to buy"', async () => {
    const { db, run } = setup({
      categories: CATEGORIES.filter((row) => row.slug !== SEED_SPOTLIGHT.after),
    });

    await run();

    expect(createSpotlight).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: STORE_ID,
      values: {
        ...SEED_SPOTLIGHT.words,
        pageId: 3,
        productId: 100,
        rowsIndex: 1,
      },
    });
  });

  test("throws when a banner's insert answers no row", async () => {
    const { db, run } = setup();
    db.$["insert.returning"].mockResolvedValue([]);

    await expect(run()).rejects.toThrow("Inserting a banner returned no row");
  });
});

describe("the seed's home content", () => {
  test("the announcement and every banner pass the rules the admin's saves hold them to", () => {
    expect(saveAnnouncementSchema.safeParse(SEED_ANNOUNCEMENT).success).toBe(
      true
    );
    const refused = [...SEED_COVER_BANNERS, ...SEED_ROW_BANNERS].filter(
      (seed) =>
        !createBannerSchema.safeParse({
          ctaLabelEn: seed.cta?.en ?? null,
          ctaLabelEs: seed.cta?.es ?? null,
          endsOn: null,
          image: {
            ...seed.computer,
            url: "https://store9.public.blob.vercel-storage.com/qa/banner/a.webp",
          },
          imagePhone: null,
          isActive: true,
          link:
            "path" in seed.link
              ? { kind: "url", url: seed.link.path }
              : { kind: "none" },
          pageId: 1,
          placement: "cover",
          startsOn: null,
          titleEn: seed.title.en,
          titleEs: seed.title.es,
        }).success
    );

    expect(refused).toEqual([]);
  });

  test("every banner photo is a JPEG in public/seed of the size the seed records", () => {
    const photos = [...SEED_COVER_BANNERS, ...SEED_ROW_BANNERS].flatMap(
      (seed) => (seed.phone ? [seed.computer, seed.phone] : [seed.computer])
    );
    const wrong = photos.flatMap((photo) => {
      const size = existsSync(
        path.join(process.cwd(), "public/seed", photo.file)
      )
        ? jpegSize(photo.file)
        : null;

      return size?.width === photo.width && size.height === photo.height
        ? []
        : [{ file: photo.file, recorded: [photo.width, photo.height], size }];
    });

    expect(wrong).toEqual([]);
  });

  test("every curated title is a seeded article's, and the featured are a row the admin's save would take", () => {
    const titles = new Set(SEED_ARTICLES.map((article) => article.title.es));

    expect(
      [...SEED_BEST_SELLERS, ...SEED_FEATURED].filter(
        (title) => !titles.has(title)
      )
    ).toEqual([]);
    expect(SEED_BEST_SELLERS.length).toBeLessThanOrEqual(10);
    expect(SEED_FEATURED.length).toBeGreaterThanOrEqual(2);
    expect(SEED_FEATURED.length).toBeLessThanOrEqual(16);
  });

  test("the spotlight's article is a seeded one, and its words pass the rules the admin's saves hold them to", () => {
    expect(
      SEED_ARTICLES.some((article) => article.title.es === SEED_SPOTLIGHT.title)
    ).toBe(true);
    expect(
      createSpotlightSchema.safeParse({
        ...SEED_SPOTLIGHT.words,
        pageId: 1,
        productId: 1,
      }).success
    ).toBe(true);
  });
});
