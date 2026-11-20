import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test, vi } from "vitest";

import { createBannerSchema, saveAnnouncementSchema } from "@/lib/schemas/home";
import {
  banner,
  bannerTranslation,
  category,
  featuredProduct,
  homeSection,
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
  seedHome,
} from "./seed-home";

const { lockStoreHome, saveAnnouncement } = vi.hoisted(() => ({
  lockStoreHome: vi.fn(async (_tx: unknown, _storeId: number) => undefined),
  saveAnnouncement: vi.fn(async (_tx: unknown, _options: unknown) => ({
    id: 1,
  })),
}));

// The service's writes are `src/server/services/home.test.ts`'s.
vi.mock("@/server/services/home", () => ({ lockStoreHome, saveAnnouncement }));

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
  "homeSection",
  "rankingEntry",
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
    db.query[model].findFirst.mockResolvedValue({ id: 9 });
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
  test("on a store with none of it, adds the announcement, five banners, the order, the best sellers and the featured, under the home's lock", async () => {
    const { db, run } = setup();

    await expect(run()).resolves.toEqual({
      announcement: true,
      banners: 5,
      featured: 4,
      ranking: 8,
    });

    expect(lockStoreHome).toHaveBeenCalledExactlyOnceWith(db, STORE_ID);
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
      homeSection,
      rankingEntry,
      featuredProduct,
    ]);
    // The first cover banner, its phone crop and its category.
    expect(inserts[0]?.values).toEqual({
      coverPosition: 0,
      imageHeight: 1067,
      imagePhoneHeight: 1067,
      imagePhoneUrl: "/seed/bubble-gun-2-phone.jpg",
      imagePhoneWidth: 854,
      imageUrl: "/seed/bubble-gun-2.jpg",
      imageWidth: 1600,
      isActive: true,
      linkCategoryId: 1,
      linkUrl: null,
      placement: "cover",
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
      coverPosition: null,
      linkCategoryId: null,
      linkUrl: "/productos",
      placement: "rows",
    });
    expect(inserts[8]?.values).toMatchObject({
      imagePhoneUrl: null,
      linkCategoryId: 5,
      placement: "rows",
    });
    expect(
      rowsOf(inserts[10]?.values).map((row) => [
        row.position,
        row.kind,
        row.bannerId ?? row.categoryId,
      ])
    ).toEqual([
      [0, "best_sellers", null],
      [1, "banner", 4],
      [2, "category", 1],
      [3, "featured", null],
      [4, "category", 3],
      [5, "category", 4],
      [6, "banner", 5],
      [7, "category", 5],
      [8, "category", 6],
      // Bijouterie, a group with no row of its own in the list, goes last.
      [9, "category", 2],
    ]);
    // A store with no order has nothing to replace.
    expect(db.$.delete).not.toHaveBeenCalled();
    expect(inserts[11]?.values).toEqual(
      SEED_BEST_SELLERS.map((_title, position) => ({
        position,
        productId: 100 + position,
        storeId: STORE_ID,
      }))
    );
    expect(inserts[12]?.values).toEqual(
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

    const [where] = db.$["select.where"].mock.calls[1] ?? [];
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
    ]);
  });

  test("leaves a store that has all of it alone", async () => {
    const { db, run } = setup({ existing: HOME_PARTS });

    await expect(run()).resolves.toEqual({
      announcement: false,
      banners: 0,
      featured: 0,
      ranking: 0,
    });
    expect(saveAnnouncement).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("keeps an order the admin saved on a store with no banner, adding the banners after it", async () => {
    const { db, run } = setup({
      existing: [
        "announcement",
        "featuredProduct",
        "homeSection",
        "rankingEntry",
      ],
    });

    await expect(run()).resolves.toEqual({
      announcement: false,
      banners: 5,
      featured: 0,
      ranking: 0,
    });
    const tables = insertsOf(db).map((insert) => insert.table);
    expect(tables).toEqual(
      Array.from({ length: 5 }, () => [banner, bannerTranslation]).flat()
    );
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("writes the order on a store that has banners but never saved one", async () => {
    const { db, run } = setup({
      existing: ["announcement", "banner", "featuredProduct", "rankingEntry"],
    });

    await expect(run()).resolves.toEqual({
      announcement: false,
      banners: 0,
      featured: 0,
      ranking: 0,
    });
    const inserts = insertsOf(db);
    expect(inserts.map((insert) => insert.table)).toEqual([homeSection]);
    // The seed's banners between rows are not this store's: left out.
    expect(
      rowsOf(inserts[0]?.values).map(
        (row) => row.bannerId ?? row.categoryId ?? row.kind
      )
    ).toEqual(["best_sellers", 1, "featured", 3, 4, 5, 6, 2]);
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
    });
    const inserts = insertsOf(db);
    expect(inserts.map((insert) => insert.table).slice(-1)).toEqual([
      homeSection,
    ]);
    // A banner whose category is missing has no link.
    expect(inserts[2]?.values).toMatchObject({ linkCategoryId: null });
    expect(rowsOf(inserts.at(-1)?.values).map((row) => row.kind)).toEqual([
      "best_sellers",
      "banner",
      "category",
      "featured",
      "banner",
    ]);
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

  test("every curated title is a seeded article's, and the featured are two to four", () => {
    const titles = new Set(SEED_ARTICLES.map((article) => article.title.es));

    expect(
      [...SEED_BEST_SELLERS, ...SEED_FEATURED].filter(
        (title) => !titles.has(title)
      )
    ).toEqual([]);
    expect(SEED_BEST_SELLERS.length).toBeLessThanOrEqual(10);
    expect(SEED_FEATURED.length).toBeGreaterThanOrEqual(2);
    expect(SEED_FEATURED.length).toBeLessThanOrEqual(4);
  });
});
