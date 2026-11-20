import { describe, expect, test, vi } from "vitest";

import {
  banner,
  bannerTranslation,
  category,
  pageCoverBanner,
  pageSection,
  product,
} from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { SEED_PAGE, seedPages } from "./seed-pages";

const { createPage, createSpotlight, lockStorePages } = vi.hoisted(() => ({
  createPage: vi.fn(async (..._args: unknown[]) => ({
    id: 12,
    slug: "regalos",
  })),
  createSpotlight: vi.fn(async (..._args: unknown[]) => ({ id: 51 })),
  lockStorePages: vi.fn(async (..._args: unknown[]) => undefined),
}));

// The services have their own tests; the seed's integration test runs them.
vi.mock("@/server/services/page", () => ({ createSpotlight, lockStorePages }));

vi.mock("@/server/services/page-settings", () => ({ createPage }));

const STORE_ID = 7;

/**
 * A store with (or without) a page at the example's address, the article
 * the spotlight features and the categories its rows show.
 */
function setup({
  article = true,
  categories = [
    { id: 3, slug: "aros" },
    { id: 2, slug: "anillos" },
    { id: 4, slug: "collares" },
  ],
  existing = false,
}: {
  article?: boolean;
  categories?: { id: number; slug: string }[];
  existing?: boolean;
} = {}) {
  const db = createMockDatabase();
  db.query.page.findFirst.mockResolvedValue(existing ? { id: 2 } : undefined);
  db.$["insert.returning"].mockResolvedValue([{ id: 30 }]);
  const read: { table: unknown } = { table: null };
  db.$["select.from"].mockImplementation((table: unknown) => {
    read.table = table;
  });
  const rows = new Map<unknown, unknown[]>([
    [category, categories],
    [product, article ? [{ id: 40 }] : []],
  ]);
  db.$["select.where"].mockImplementation(
    async () => await Promise.resolve(rows.get(read.table) ?? [])
  );

  return { db, run: async () => await seedPages(db as never, STORE_ID) };
}

describe("seedPages", () => {
  test("adds the example page with its cover banner, its spotlight and its rows, in that order", async () => {
    const { db, run } = setup();

    await expect(run()).resolves.toBe(true);

    expect(lockStorePages).toHaveBeenCalledExactlyOnceWith(db, STORE_ID);
    expect(createPage).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: STORE_ID,
      values: { ...SEED_PAGE.values, slug: "regalos" },
    });
    expect(db.$.insert.mock.calls).toEqual([
      [banner],
      [bannerTranslation],
      [pageCoverBanner],
      [pageSection],
    ]);
    expect(db.$["insert.values"].mock.calls.slice(1)).toEqual([
      [
        [
          { bannerId: 30, locale: "es", title: "Regalos para las fiestas" },
          { bannerId: 30, locale: "en", title: "Gifts for the holidays" },
        ],
      ],
      [{ bannerId: 30, pageId: 12, position: 0 }],
      [
        [
          {
            kind: "spotlight",
            pageId: 12,
            position: 0,
            spotlightId: 51,
            storeId: STORE_ID,
          },
          // Anillos then Aros, the seed's order, not the store's.
          {
            categoryId: 2,
            kind: "category",
            pageId: 12,
            position: 1,
            storeId: STORE_ID,
          },
          {
            categoryId: 3,
            kind: "category",
            pageId: 12,
            position: 2,
            storeId: STORE_ID,
          },
        ],
      ],
    ]);
    expect(db.$["insert.values"].mock.calls[0]?.[0]).toMatchObject({
      imagePhoneUrl: "/seed/ring-3-phone.jpg",
      imageUrl: "/seed/ring-3.jpg",
      linkUrl: "/productos",
      storeId: STORE_ID,
    });
    expect(createSpotlight).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: STORE_ID,
      values: {
        ...SEED_PAGE.spotlight.words,
        pageId: 12,
        productId: 40,
        rowsIndex: 0,
      },
    });
    // What the service placed goes first: the seed sets the order itself.
    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(pageSection);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [12],
      sql: '"page_section"."pageId" = $1',
    });
  });

  test("leaves a store that already has a page at the address alone", async () => {
    const { db, run } = setup({ existing: true });

    await expect(run()).resolves.toBe(false);

    expect(createPage).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
    const [query] = db.query.page.findFirst.mock.calls[0] ?? [];
    expect(renderQuery((query as { where: unknown }).where)).toEqual({
      params: [STORE_ID, "regalos"],
      sql: '("page"."storeId" = $1 and "page"."slug" = $2)',
    });
  });

  test("without the article, shows the rows only, from the first place", async () => {
    const { db, run } = setup({
      article: false,
      categories: [{ id: 2, slug: "anillos" }],
    });

    await run();

    expect(createSpotlight).not.toHaveBeenCalled();
    expect(db.$["insert.values"].mock.calls.at(-1)).toEqual([
      [
        {
          categoryId: 2,
          kind: "category",
          pageId: 12,
          position: 0,
          storeId: STORE_ID,
        },
      ],
    ]);
  });

  test("without the article or the categories, writes no block", async () => {
    const { db, run } = setup({ article: false, categories: [] });

    await expect(run()).resolves.toBe(true);

    expect(db.$.insert.mock.calls).toEqual([
      [banner],
      [bannerTranslation],
      [pageCoverBanner],
    ]);
  });

  test("throws when the banner's insert answers no row", async () => {
    const { db, run } = setup();
    db.$["insert.returning"].mockResolvedValue([]);

    await expect(run()).rejects.toThrow("Inserting a banner returned no row");
    expect(db.$.insert).toHaveBeenCalledOnce();
  });
});
