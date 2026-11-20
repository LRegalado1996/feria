import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  CreateBannerValues,
  SaveAnnouncementValues,
  SavePageLayoutValues,
} from "@/lib/schemas/page";
import { type DatabaseClient, db } from "@/server/db";
import {
  announcement,
  banner,
  category,
  categoryTranslation,
  featuredProduct,
  pageCoverBanner,
  pageSection,
  product,
  productTranslation,
  rankingEntry,
  spotlight,
} from "@/server/db/schema";
import { theStoreId, uniqueTag } from "@/server/test/one-store";
import { readyOrFailed } from "@/server/test/two-writers";

import {
  createBanner,
  createSpotlight,
  deleteBanner,
  deleteSpotlight,
  findHomePageId,
  findShowingAnnouncement,
  getPageContent,
  getPageCuration,
  saveAnnouncement,
  savePageLayout,
  updateBanner,
  updateSpotlight,
} from "./page";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// The deployment's Blob store (FER-011): banners it uploaded live in its
// `local/banner/` folder. Nothing here reaches the real store.
const BLOB_STORE = {
  host: "integration.public.blob.vercel-storage.com",
  namespace: "local",
  token: "vercel_blob_rw_Integration_synthetic",
} as const;

const ROLLED_BACK = "Rolled back on purpose: this test keeps nothing";

/** The business day the reads run on, and the days around it. */
const TODAY = "2026-12-05";
const YESTERDAY = "2026-12-04";
const TOMORROW = "2026-12-06";

/** An upload of this deployment for `purpose`, no other call gave. */
function upload(purpose = "banner", host: string = BLOB_STORE.host) {
  return {
    height: 800,
    url: `https://${host}/local/${purpose}/${randomUUID()}.webp`,
    width: 1600,
  };
}

function announcementValues(
  overrides: Partial<SaveAnnouncementValues> = {}
): SaveAnnouncementValues {
  return {
    endsOn: null,
    isActive: true,
    linkUrl: "/productos",
    shortTextEn: null,
    shortTextEs: "En la feria",
    startsOn: null,
    textEn: null,
    textEs: "Encontranos en la feria",
    ...overrides,
  };
}

function bannerValues(
  pageId: number,
  overrides: Partial<CreateBannerValues> = {}
): CreateBannerValues {
  return {
    pageId,
    ctaLabelEn: null,
    ctaLabelEs: null,
    endsOn: null,
    image: upload(),
    imagePhone: null,
    isActive: true,
    link: { kind: "none" },
    placement: "cover",
    startsOn: null,
    titleEn: null,
    titleEs: `Banner ${uniqueTag()}`,
    ...overrides,
  };
}

/**
 * The store's home curation removed: every row of it is the one store's, so
 * a test that reads the home starts from none, inside its own transaction.
 */
async function clearHome(
  tx: DatabaseClient,
  { pageId, storeId }: { pageId: number; storeId: number }
) {
  await tx.delete(announcement).where(eq(announcement.storeId, storeId));
  await tx.delete(banner).where(eq(banner.storeId, storeId));
  await tx.delete(spotlight).where(eq(spotlight.storeId, storeId));
  await tx.delete(pageSection).where(eq(pageSection.pageId, pageId));
  await tx.delete(rankingEntry).where(eq(rankingEntry.storeId, storeId));
  await tx.delete(featuredProduct).where(eq(featuredProduct.storeId, storeId));
}

/**
 * Runs `work` on the store's home page (FER-058) with no curation, in a
 * transaction that is rolled back: the announcement, the home's sequence
 * and the curated rows are the store's one set, which every file of the
 * worker shares.
 */
async function onEmptyHome(
  work: (tx: DatabaseClient, storeId: number, pageId: number) => Promise<void>
) {
  const run = db.transaction(async (tx) => {
    const storeId = await theStoreId(tx);
    const pageId = await findHomePageId(tx, { storeId });
    await clearHome(tx, { pageId, storeId });
    await work(tx, storeId, pageId);

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation inside rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
}

/** A category of the store, last, in `parentId`'s group or in none. */
async function addCategory(
  tx: DatabaseClient,
  storeId: number,
  parentId: number | null = null
) {
  const tag = uniqueTag();
  const [row] = await tx
    .insert(category)
    .values({ parentId, position: 10_000, slug: `home-${tag}`, storeId })
    .returning({ id: category.id, slug: category.slug });

  if (!row) {
    throw new Error("Inserting a category returned no row");
  }

  await tx
    .insert(categoryTranslation)
    .values({ categoryId: row.id, locale: "es", name: `Categoría ${tag}` });

  return { ...row, name: `Categoría ${tag}` };
}

/** An article of `categoryId`, published and available unless told. */
async function addArticle(
  tx: DatabaseClient,
  {
    available = true,
    categoryId,
    published = true,
    storeId,
  }: {
    available?: boolean;
    categoryId: number;
    published?: boolean;
    storeId: number;
  }
) {
  const [row] = await tx
    .insert(product)
    .values({
      categoryId,
      isAvailable: available,
      priceAmount: 1290,
      publishedAt: published ? new Date("2026-11-01T12:00:00.000Z") : null,
      slug: `home-${uniqueTag()}`,
      status: published ? "published" : "draft",
      storeId,
    })
    .returning({ id: product.id, slug: product.slug });

  if (!row) {
    throw new Error("Inserting an article returned no row");
  }

  await tx.insert(productTranslation).values({
    description: "",
    locale: "es",
    productId: row.id,
    title: `Artículo ${row.slug}`,
  });

  return row;
}

async function readContent(
  tx: DatabaseClient,
  storeId: number,
  {
    locale = "es",
    today = TODAY,
  }: { locale?: "en" | "es"; today?: string } = {}
) {
  return await getPageContent(tx, {
    currencyCode: "UYU",
    locale,
    pageId: await findHomePageId(tx, { storeId }),
    storeId,
    today,
  });
}

describe("the announcement on the storefront", () => {
  test.each([
    ["no days, switched on", {}, true],
    ["switched off", { isActive: false }, false],
    ["starting today", { startsOn: TODAY }, true],
    ["starting yesterday", { startsOn: YESTERDAY }, true],
    ["starting tomorrow", { startsOn: TOMORROW }, false],
    ["ending today", { endsOn: TODAY }, true],
    ["ending tomorrow", { endsOn: TOMORROW }, true],
    ["ended yesterday", { endsOn: YESTERDAY }, false],
    ["on today alone", { endsOn: TODAY, startsOn: TODAY }, true],
  ] as const)("%s: shows on %s is %s", async (_case, days, shows) => {
    await onEmptyHome(async (tx, storeId) => {
      await saveAnnouncement(tx, {
        storeId,
        values: announcementValues(days),
      });

      const expected = shows
        ? {
            href: "/productos",
            lang: "es",
            shortText: "En la feria",
            text: "Encontranos en la feria",
          }
        : null;
      expect(
        await findShowingAnnouncement(tx, {
          locale: "es",
          storeId,
          today: TODAY,
        })
      ).toEqual(expected);
    });
  });

  test("speaks English where it has English, else Spanish marked as such; a second save replaces it and drops the English", async () => {
    await onEmptyHome(async (tx, storeId) => {
      await saveAnnouncement(tx, {
        storeId,
        values: announcementValues({
          shortTextEn: "At the fair",
          textEn: "Find us at the fair",
        }),
      });

      await expect(
        findShowingAnnouncement(tx, { locale: "en", storeId, today: TODAY })
      ).resolves.toEqual({
        href: "/productos",
        lang: "en",
        shortText: "At the fair",
        text: "Find us at the fair",
      });

      await saveAnnouncement(tx, {
        storeId,
        values: announcementValues({ linkUrl: null, textEs: "Otra cosa" }),
      });

      await expect(
        findShowingAnnouncement(tx, { locale: "en", storeId, today: TODAY })
      ).resolves.toEqual({
        href: null,
        lang: "es",
        shortText: "En la feria",
        text: "Otra cosa",
      });
      expect(
        await tx
          .select({ id: announcement.id })
          .from(announcement)
          .where(eq(announcement.storeId, storeId))
      ).toHaveLength(1);
    });
  });
});

describe("the banners on the storefront", () => {
  test.each([
    ["no days, switched on", {}, true],
    ["switched off", { isActive: false }, false],
    ["starting today", { startsOn: TODAY }, true],
    ["starting tomorrow", { startsOn: TOMORROW }, false],
    ["ending today", { endsOn: TODAY }, true],
    ["ended yesterday", { endsOn: YESTERDAY }, false],
  ] as const)("%s: in the cover is %s", async (_case, days, shows) => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const values = bannerValues(pageId, days);
      const { id } = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values,
      });

      expect((await readContent(tx, storeId)).cover).toEqual(
        shows
          ? [
              {
                ctaLabel: null,
                href: null,
                id,
                image: values.image,
                lang: "es",
                phoneImage: null,
                title: values.titleEs,
              },
            ]
          : []
      );
    });
  });

  test("lead to a published article, a category under its group or an address; an article no longer published leaves the banner without a link", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const group = await addCategory(tx, storeId);
      const child = await addCategory(tx, storeId, group.id);
      const article = await addArticle(tx, { categoryId: child.id, storeId });
      const draft = await addArticle(tx, {
        categoryId: child.id,
        published: false,
        storeId,
      });
      const links = [
        { kind: "product", productId: article.id },
        { kind: "product", productId: draft.id },
        { categoryId: child.id, kind: "category" },
        { kind: "url", url: "https://instagram.com/lr-market" },
      ] as const;

      for (const link of links) {
        await createBanner(tx, {
          blobStore: BLOB_STORE,
          storeId,
          values: bannerValues(pageId, { link }),
        });
      }

      expect(
        (await readContent(tx, storeId)).cover.map((shown) => shown.href)
      ).toEqual([
        `/productos/${article.slug}`,
        null,
        `/${group.slug}/${child.slug}`,
        "https://instagram.com/lr-market",
      ]);

      // Deleting the article clears the link; the banner stays.
      await tx.delete(product).where(eq(product.id, article.id));

      expect(
        (await readContent(tx, storeId)).cover.map((shown) => shown.href)
      ).toEqual([
        null,
        null,
        `/${group.slug}/${child.slug}`,
        "https://instagram.com/lr-market",
      ]);
    });
  });
});

describe("the rows on the storefront", () => {
  test("curated rows keep what can be bought; a category's row keeps its sold-out articles; a category with nothing published has no row", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const shelf = await addCategory(tx, storeId);
      const drafts = await addCategory(tx, storeId);
      const ready = await addArticle(tx, { categoryId: shelf.id, storeId });
      const soldOut = await addArticle(tx, {
        available: false,
        categoryId: shelf.id,
        storeId,
      });
      const draft = await addArticle(tx, {
        categoryId: drafts.id,
        published: false,
        storeId,
      });
      await savePageLayout(tx, {
        storeId,
        values: {
          pageId,
          coverBannerIds: [],
          featuredProductIds: [soldOut.id, ready.id],
          rankingProductIds: [draft.id, soldOut.id, ready.id],
          sections: [],
        },
      });
      const own = new Set([
        "best_sellers",
        "featured",
        `category:${String(shelf.id)}`,
        `category:${String(drafts.id)}`,
      ]);

      const content = await readContent(tx, storeId);

      expect(
        content.sections
          .filter((section) => own.has(section.key))
          .map((section) => [
            section.key,
            "articles" in section
              ? section.articles.map((card) => [card.id, card.isAvailable])
              : [],
          ])
      ).toEqual([
        ["best_sellers", [[ready.id, true]]],
        ["featured", [[ready.id, true]]],
        [
          `category:${String(shelf.id)}`,
          [
            [ready.id, true],
            [soldOut.id, false],
          ],
        ],
      ]);
    });
  });

  test("a curated row with nothing to show is left out, and a banner between rows shows in its place while it is on", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const shelf = await addCategory(tx, storeId);
      await addArticle(tx, { categoryId: shelf.id, storeId });
      const shown = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues(pageId, { placement: "rows", rowsIndex: 0 }),
      });
      const off = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues(pageId, {
          isActive: false,
          placement: "rows",
          rowsIndex: 0,
        }),
      });

      const keys = (await readContent(tx, storeId)).sections.map(
        (section) => section.key
      );

      expect(keys[0]).toBe(`banner:${String(shown.id)}`);
      expect(keys).not.toContain(`banner:${String(off.id)}`);
      expect(keys).not.toContain("best_sellers");
      expect(keys).not.toContain("featured");
      expect(keys).toContain(`category:${String(shelf.id)}`);
    });
  });
});

describe("banner writes", () => {
  test.each([
    ["another host's file", upload("banner", "elsewhere.example.com")],
    ["an upload for covers", upload("cover")],
    [
      "a photo of the site",
      { height: 800, url: "https://lr.example/a.jpg", width: 1600 },
    ],
  ])("a new banner refuses %s", async (_case, image) => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      await expect(
        createBanner(tx, {
          blobStore: BLOB_STORE,
          storeId,
          values: bannerValues(pageId, { image }),
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "A banner photo must be one uploaded to this store",
      });
    });
  });

  test("a deployment without a Blob store takes no new photo", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      await expect(
        createBanner(tx, {
          blobStore: null,
          storeId,
          values: bannerValues(pageId),
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "A banner photo must be one uploaded to this store",
      });
    });
  });

  test("refuses a link to an article or a category the store does not have", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const shelf = await addCategory(tx, storeId);
      const gone = await addArticle(tx, { categoryId: shelf.id, storeId });
      await tx.delete(product).where(eq(product.id, gone.id));
      await tx.delete(category).where(eq(category.id, shelf.id));

      await expect(
        createBanner(tx, {
          blobStore: BLOB_STORE,
          storeId,
          values: bannerValues(pageId, {
            link: { kind: "product", productId: gone.id },
          }),
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Article not found",
      });
      await expect(
        createBanner(tx, {
          blobStore: BLOB_STORE,
          storeId,
          values: bannerValues(pageId, {
            link: { categoryId: shelf.id, kind: "category" },
          }),
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Category not found",
      });
    });
  });

  test("an edit keeps a seeded photo it leaves out, refuses another one, and answers the files it drops", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const [seeded] = await tx
        .insert(banner)
        .values({
          imageHeight: 800,
          imagePhoneHeight: 800,
          imagePhoneUrl: "/seed/ring-3-phone.jpg",
          imagePhoneWidth: 800,
          imageUrl: "/seed/ring-3.jpg",
          imageWidth: 1200,
          storeId,
        })
        .returning({ id: banner.id });
      const id = seeded?.id ?? 0;
      await tx
        .insert(pageCoverBanner)
        .values({ bannerId: id, pageId, position: 0 });
      const fields = { ...bannerValues(pageId), id };
      const { image: _image, imagePhone: _phone, ...words } = fields;

      await expect(
        updateBanner(tx, { blobStore: BLOB_STORE, storeId, values: words })
      ).resolves.toEqual({ discardedImageUrls: [], id });
      await expect(
        updateBanner(tx, {
          blobStore: BLOB_STORE,
          storeId,
          values: {
            ...words,
            image: { height: 800, url: "/seed/ring-3.jpg", width: 1200 },
          },
        })
      ).resolves.toEqual({ discardedImageUrls: [], id });
      await expect(
        updateBanner(tx, {
          blobStore: BLOB_STORE,
          storeId,
          values: {
            ...words,
            image: { height: 800, url: "/seed/ring-2.jpg", width: 1200 },
          },
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "A banner photo must be one uploaded to this store",
      });

      const replaced = upload();
      await expect(
        updateBanner(tx, {
          blobStore: BLOB_STORE,
          storeId,
          values: { ...words, image: replaced, imagePhone: null },
        })
      ).resolves.toEqual({
        discardedImageUrls: ["/seed/ring-3.jpg", "/seed/ring-3-phone.jpg"],
        id,
      });
      expect(
        await tx.query.banner.findFirst({
          columns: { imagePhoneUrl: true, imageUrl: true },
          where: eq(banner.id, id),
        })
      ).toEqual({ imagePhoneUrl: null, imageUrl: replaced.url });

      await expect(deleteBanner(tx, { id, storeId })).resolves.toEqual({
        discardedImageUrls: [replaced.url],
        id,
      });
      await expect(deleteBanner(tx, { id, storeId })).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Banner not found",
      });
      await expect(
        updateBanner(tx, { blobStore: BLOB_STORE, storeId, values: words })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Banner not found",
      });
    });
  });

  test("moving a banner between the cover and the rows moves its place with it", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const first = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues(pageId),
      });
      const moving = bannerValues(pageId);
      const { id } = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: moving,
      });
      const { image: _image, imagePhone: _phone, ...words } = moving;
      const placeOf = async () =>
        (await getPageCuration(tx, { pageId, storeId, today: TODAY })).sections
          .map((section) =>
            section.kind === "banner" ? section.bannerId : null
          )
          .indexOf(id);

      await updateBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: { ...words, id, placement: "rows", rowsIndex: 1 },
      });

      expect(await placeOf()).toBe(1);
      expect(
        (await getPageCuration(tx, { pageId, storeId, today: TODAY }))
          .coverBannerIds
      ).toEqual([first.id]);

      await updateBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: { ...words, id, placement: "cover" },
      });

      expect(await placeOf()).toBe(-1);
      expect(
        (await getPageCuration(tx, { pageId, storeId, today: TODAY }))
          .coverBannerIds
      ).toEqual([first.id, id]);
    });
  });

  test("the cover takes a sixth banner and refuses a seventh, new or moved in; one in it is still edited", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const create = async (values: CreateBannerValues) =>
        await createBanner(tx, { blobStore: BLOB_STORE, storeId, values });
      const covered: number[] = [];

      for (let index = 0; index < 6; index += 1) {
        covered.push((await create(bannerValues(pageId))).id);
      }

      const full = {
        code: "CONFLICT",
        message: "The cover holds at most 6 banners",
      };
      await expect(create(bannerValues(pageId))).rejects.toMatchObject(full);
      const between = bannerValues(pageId, { placement: "rows" });
      const { id } = await create(between);
      const { image: _image, imagePhone: _phone, ...words } = between;
      await expect(
        updateBanner(tx, {
          blobStore: BLOB_STORE,
          storeId,
          values: { ...words, id, placement: "cover" },
        })
      ).rejects.toMatchObject(full);
      const last = covered.at(-1) ?? 0;
      await expect(
        updateBanner(tx, {
          blobStore: BLOB_STORE,
          storeId,
          values: { ...words, id: last, placement: "cover" },
        })
      ).resolves.toEqual({ discardedImageUrls: [], id: last });

      expect(
        (await getPageCuration(tx, { pageId, storeId, today: TODAY }))
          .coverBannerIds
      ).toEqual(covered);
    });
  });
});

describe("saving the home's order", () => {
  test("refuses what the store does not have, and a banner listed in the place it is not in", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const shelf = await addCategory(tx, storeId);
      const gone = await addArticle(tx, { categoryId: shelf.id, storeId });
      await tx.delete(product).where(eq(product.id, gone.id));
      const cover = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues(pageId),
      });
      const rows = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues(pageId, { placement: "rows" }),
      });
      const save = async (values: Partial<SavePageLayoutValues>) =>
        await savePageLayout(tx, {
          storeId,
          values: {
            pageId,
            coverBannerIds: [],
            featuredProductIds: [],
            rankingProductIds: [],
            sections: [],
            ...values,
          },
        });

      await expect(
        save({ rankingProductIds: [gone.id] })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Article not found",
      });
      await expect(
        save({ sections: [{ categoryId: 2_000_000_000, kind: "category" }] })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Category not found",
      });
      await expect(
        save({ coverBannerIds: [2_000_000_000] })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Banner not found",
      });
      await expect(
        save({ sections: [{ bannerId: cover.id, kind: "banner" }] })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "That banner is in the cover, not between rows",
      });
      await expect(save({ coverBannerIds: [rows.id] })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "That banner is between rows, not in the cover",
      });
    });
  });

  test("writes the order whole: places numbered from 0, what was left out after the rest, the curated rows and the cover in order", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const one = await addCategory(tx, storeId);
      const two = await addCategory(tx, storeId);
      // Left out of the save: it comes after what was saved.
      const three = await addCategory(tx, storeId);
      const a = await addArticle(tx, { categoryId: one.id, storeId });
      const b = await addArticle(tx, { categoryId: two.id, storeId });
      const c = await addArticle(tx, { categoryId: two.id, storeId });
      const first = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues(pageId),
      });
      const second = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues(pageId),
      });
      const between = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues(pageId, { placement: "rows" }),
      });

      await savePageLayout(tx, {
        storeId,
        values: {
          pageId,
          coverBannerIds: [second.id],
          featuredProductIds: [c.id, a.id],
          rankingProductIds: [b.id, a.id, c.id],
          sections: [
            { categoryId: two.id, kind: "category" },
            { kind: "featured" },
            { bannerId: between.id, kind: "banner" },
            { categoryId: one.id, kind: "category" },
            { kind: "best_sellers" },
          ],
        },
      });

      const saved = await tx
        .select({
          bannerId: pageSection.bannerId,
          categoryId: pageSection.categoryId,
          kind: pageSection.kind,
          position: pageSection.position,
        })
        .from(pageSection)
        .where(eq(pageSection.pageId, pageId))
        .orderBy(asc(pageSection.position));
      expect(saved.slice(0, 5)).toEqual([
        { bannerId: null, categoryId: two.id, kind: "category", position: 0 },
        { bannerId: null, categoryId: null, kind: "featured", position: 1 },
        { bannerId: between.id, categoryId: null, kind: "banner", position: 2 },
        { bannerId: null, categoryId: one.id, kind: "category", position: 3 },
        { bannerId: null, categoryId: null, kind: "best_sellers", position: 4 },
      ]);
      // The store's other categories, left out, come after, numbered on, in
      // the categories' own order: the one made last, last.
      expect(saved.map((row) => row.position)).toEqual(
        saved.map((_row, index) => index)
      );
      expect(saved.slice(5).every((row) => row.kind === "category")).toBe(true);
      const [counted] = await tx
        .select({ others: sql<number>`count(*)::int` })
        .from(category)
        .where(
          and(
            eq(category.storeId, storeId),
            notInArray(category.id, [one.id, two.id, three.id])
          )
        );
      expect(saved.at(-1)).toEqual({
        bannerId: null,
        categoryId: three.id,
        kind: "category",
        position: 5 + (counted?.others ?? 0),
      });
      const curation = await getPageCuration(tx, {
        pageId,
        storeId,
        today: TODAY,
      });
      expect(curation.rankingProductIds).toEqual([b.id, a.id, c.id]);
      expect(curation.featuredProductIds).toEqual([c.id, a.id]);
      // The banner left out of the cover goes after the one listed.
      expect(curation.coverBannerIds).toEqual([second.id, first.id]);

      // A deleted category takes its place with it.
      await tx.delete(product).where(eq(product.id, a.id));
      await tx.delete(category).where(eq(category.id, one.id));

      expect(
        (
          await tx
            .select({ categoryId: pageSection.categoryId })
            .from(pageSection)
            .where(
              and(
                eq(pageSection.pageId, pageId),
                eq(pageSection.kind, "category")
              )
            )
        ).map((row) => row.categoryId)
      ).not.toContain(one.id);
      expect(
        (await getPageCuration(tx, { pageId, storeId, today: TODAY })).sections
      ).not.toContainEqual({ categoryId: one.id, kind: "category" });
    });
  });
});

describe("the article spotlights on a page", () => {
  test("show while their article is published and can be bought, and leave the page when it is not, on both sides of each", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const shelf = await addCategory(tx, storeId);
      const ready = await addArticle(tx, { categoryId: shelf.id, storeId });
      const soldOut = await addArticle(tx, {
        available: false,
        categoryId: shelf.id,
        storeId,
      });
      const draft = await addArticle(tx, {
        categoryId: shelf.id,
        published: false,
        storeId,
      });
      const ids: Record<string, number> = {};

      for (const [name, productId] of [
        ["ready", ready.id],
        ["soldOut", soldOut.id],
        ["draft", draft.id],
      ] as const) {
        ids[name] = (
          await createSpotlight(tx, {
            storeId,
            values: {
              labelEn: "New",
              labelEs: "Nuevo",
              pageId,
              phraseEn: null,
              phraseEs: "El que más piden.",
              productId,
            },
          })
        ).id;
      }

      const shown = async () =>
        (await readContent(tx, storeId, { locale: "en" })).sections.flatMap(
          (section) =>
            section.kind === "spotlight"
              ? [[section.spotlight.id, section.spotlight.article.id]]
              : []
        );

      expect(await shown()).toEqual([[ids.ready, ready.id]]);
      const [first] = (await readContent(tx, storeId, { locale: "en" }))
        .sections;
      // Each new one went first: the last made opens the page, under the
      // cover; its words in English where it has them, else in Spanish.
      expect(first).toMatchObject({
        kind: "spotlight",
        spotlight: {
          label: { lang: "en", text: "New" },
          phrase: { lang: "es", text: "El que más piden." },
        },
      });

      // The other side of each: sold out → can be bought; published →
      // draft.
      await tx
        .update(product)
        .set({ isAvailable: true })
        .where(eq(product.id, soldOut.id));
      await tx
        .update(product)
        .set({ status: "draft" })
        .where(eq(product.id, ready.id));

      expect(await shown()).toEqual([[ids.soldOut, soldOut.id]]);

      // Deleting the article deletes its spotlight and its place.
      await tx.delete(product).where(eq(product.id, soldOut.id));
      expect(
        await tx
          .select({ id: spotlight.id })
          .from(spotlight)
          .where(eq(spotlight.id, ids.soldOut ?? 0))
      ).toEqual([]);
      expect(
        (
          await getPageCuration(tx, { pageId, storeId, today: TODAY })
        ).sections.filter((section) => section.kind === "spotlight")
      ).toEqual([
        { kind: "spotlight", spotlightId: ids.draft },
        { kind: "spotlight", spotlightId: ids.ready },
      ]);
    });
  });

  test("an edit moves it and rewrites its words; a delete takes its place with it", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const shelf = await addCategory(tx, storeId);
      const one = await addArticle(tx, { categoryId: shelf.id, storeId });
      const other = await addArticle(tx, { categoryId: shelf.id, storeId });
      const values = {
        labelEn: null,
        labelEs: "Nuevo",
        pageId,
        phraseEn: null,
        phraseEs: null,
        productId: one.id,
      };
      const { id } = await createSpotlight(tx, { storeId, values });

      await updateSpotlight(tx, {
        storeId,
        values: {
          ...values,
          id,
          labelEs: null,
          phraseEn: "Kids love it.",
          productId: other.id,
          rowsIndex: 2,
        },
      });

      const curation = await getPageCuration(tx, {
        pageId,
        storeId,
        today: TODAY,
      });
      expect(curation.sections[2]).toEqual({
        kind: "spotlight",
        spotlightId: id,
      });
      expect(curation.spotlights).toEqual([
        {
          id,
          labelEn: null,
          labelEs: null,
          onPage: true,
          phraseEn: "Kids love it.",
          phraseEs: null,
          productId: other.id,
        },
      ]);

      await deleteSpotlight(tx, { id, storeId });

      const after = await getPageCuration(tx, {
        pageId,
        storeId,
        today: TODAY,
      });
      expect(after.spotlights).toEqual([]);
      expect(
        after.sections.filter((section) => section.kind === "spotlight")
      ).toEqual([]);
    });
  });

  test("refuses an article, a page or a spotlight the store does not have", async () => {
    await onEmptyHome(async (tx, storeId, pageId) => {
      const values = {
        labelEn: null,
        labelEs: "Nuevo",
        pageId,
        phraseEn: null,
        phraseEs: null,
        productId: 2_000_000_000,
      };

      await expect(
        createSpotlight(tx, { storeId, values })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Article not found",
      });
      await expect(
        createSpotlight(tx, {
          storeId,
          values: { ...values, pageId: 2_000_000_000 },
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Page not found" });
      await expect(
        deleteSpotlight(tx, { id: 2_000_000_000, storeId })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Spotlight not found",
      });
    });
  });
});

/** A promise and the function that settles it, for ordering two writers. */
function deferred() {
  let settle: (value: undefined) => void = () => undefined;
  const promise = new Promise<undefined>((resolve) => {
    settle = resolve;
  });

  return { promise, resolve: settle };
}

/** The id of the backend running `tx`, to tell its lock waits from others'. */
async function backendOf(tx: DatabaseClient) {
  const result = await tx.execute<{ pid: number }>(
    sql`select pg_backend_pid() as pid`
  );

  return result.rows[0]?.pid ?? 0;
}

/**
 * Waits until the backend `pid` waits on the store's pages' lock: an
 * advisory lock not granted, whose key is `hashtext('pages:<storeId>')`.
 * Any other wait (a row lock, another store's pages) does not count.
 */
async function waitUntilBlocked(pid: number, storeId: number) {
  const key = `pages:${String(storeId)}`;

  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const result = await db.execute<{ waiting: number }>(sql`
      select count(*)::int as waiting
      from pg_locks
      where locktype = 'advisory'
        and not granted
        and pid = ${pid}
        and objsubid = 1
        and objid::bigint = (hashtext(${key})::bigint & 4294967295)
    `);

    if ((result.rows[0]?.waiting ?? 0) > 0) {
      return;
    }
  }

  throw new Error("The second writer never waited on the pages' lock");
}

// The two-writer tests commit: what they created is deleted by id, and the
// store's home is put back as it was.
const committed = {
  categoryIds: [] as number[],
  productIds: [] as number[],
  restore: [] as (() => Promise<void>)[],
};

afterEach(async () => {
  await db
    .delete(product)
    .where(inArray(product.id, committed.productIds.splice(0)));
  await db
    .delete(category)
    .where(inArray(category.id, committed.categoryIds.splice(0)));

  for (const restore of committed.restore.splice(0)) {
    await restore();
  }
});

/**
 * Keeps the store's sequence, curated rows and cover places as they are
 * now, to be put back after the test, and adds a category with three articles to rank.
 */
async function setupTwoWriters() {
  const storeId = await theStoreId(db);
  const pageId = await findHomePageId(db, { storeId });
  const sections = await db
    .select({
      bannerId: pageSection.bannerId,
      categoryId: pageSection.categoryId,
      kind: pageSection.kind,
      pageId: pageSection.pageId,
      position: pageSection.position,
      spotlightId: pageSection.spotlightId,
      storeId: pageSection.storeId,
    })
    .from(pageSection)
    .where(eq(pageSection.pageId, pageId));
  const ranking = await db
    .select({
      position: rankingEntry.position,
      productId: rankingEntry.productId,
      storeId: rankingEntry.storeId,
    })
    .from(rankingEntry)
    .where(eq(rankingEntry.storeId, storeId));
  const featured = await db
    .select({
      position: featuredProduct.position,
      productId: featuredProduct.productId,
      storeId: featuredProduct.storeId,
    })
    .from(featuredProduct)
    .where(eq(featuredProduct.storeId, storeId));
  // A save rewrites the page's cover from 0, though it lists none of it.
  const cover = await db
    .select({
      bannerId: pageCoverBanner.bannerId,
      pageId: pageCoverBanner.pageId,
      position: pageCoverBanner.position,
    })
    .from(pageCoverBanner)
    .where(eq(pageCoverBanner.pageId, pageId));
  committed.restore.push(async () => {
    await db.transaction(async (tx) => {
      await tx.delete(pageSection).where(eq(pageSection.pageId, pageId));
      await tx.delete(rankingEntry).where(eq(rankingEntry.storeId, storeId));
      await tx
        .delete(featuredProduct)
        .where(eq(featuredProduct.storeId, storeId));
      await tx
        .delete(pageCoverBanner)
        .where(eq(pageCoverBanner.pageId, pageId));

      if (sections.length > 0) {
        await tx.insert(pageSection).values(sections);
      }

      if (ranking.length > 0) {
        await tx.insert(rankingEntry).values(ranking);
      }

      if (featured.length > 0) {
        await tx.insert(featuredProduct).values(featured);
      }

      if (cover.length > 0) {
        await tx.insert(pageCoverBanner).values(cover);
      }
    });
  });
  // One commit: nothing is left behind half made, and the ids are recorded
  // for the teardown only once they exist.
  const made = await db.transaction(async (tx) => {
    const shelf = await addCategory(tx, storeId);
    const ids: number[] = [];

    for (let index = 0; index < 3; index += 1) {
      ids.push((await addArticle(tx, { categoryId: shelf.id, storeId })).id);
    }

    return { articles: ids, shelfId: shelf.id };
  });
  committed.categoryIds.push(made.shelfId);
  committed.productIds.push(...made.articles);

  return {
    articles: made.articles,
    storeId,
    // The store's curated rows now, by the ids this test ranked.
    ranked: async () =>
      (
        await db
          .select({ productId: rankingEntry.productId })
          .from(rankingEntry)
          .where(eq(rankingEntry.storeId, storeId))
          .orderBy(asc(rankingEntry.position))
      ).map((row) => row.productId),
    save: async (tx: DatabaseClient, rankingProductIds: number[]) =>
      await savePageLayout(tx, {
        storeId,
        values: {
          pageId,
          coverBannerIds: [],
          featuredProductIds: [],
          rankingProductIds,
          sections: [],
        },
      }),
  };
}

describe("the home's order under two writers", () => {
  test("a save started while another holds the home's lock waits for it, then writes its own order whole", async () => {
    const { articles, ranked, save, storeId } = await setupTwoWriters();
    const [a = 0, b = 0, c = 0] = articles;
    const held = deferred();
    const locked = deferred();
    const first = db.transaction(async (tx) => {
      const saved = await save(tx, [a, b, c]);
      locked.resolve(undefined);
      await held.promise;

      return saved;
    });
    // A first writer that fails never signals: its failure ends the wait.
    await Promise.race([locked.promise, first]);
    const pid: { resolve: (value: number) => void } = {
      resolve: () => undefined,
    };
    const secondPid = new Promise<number>((resolve) => {
      pid.resolve = resolve;
    });
    const second = db.transaction(async (tx) => {
      pid.resolve(await backendOf(tx));
      return await save(tx, [c, a]);
    });
    const settled: { results: PromiseSettledResult<unknown>[] } = {
      results: [],
    };

    // Both writers end before the teardown, whatever the wait does: a
    // second writer that fails before it says its process ends the wait
    // too, instead of leaving the first holding the lock.
    try {
      await waitUntilBlocked(await readyOrFailed(secondPid, second), storeId);
    } finally {
      held.resolve(undefined);
      settled.results = await Promise.allSettled([first, second]);
    }

    const { results } = settled;

    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    // Without the lock the second would write its places over rows the
    // first had not committed and fail on the unique position.
    expect(await ranked()).toEqual([c, a]);
  });

  test("two saves one after the other each replace the order whole", async () => {
    const { articles, ranked, save } = await setupTwoWriters();
    const [a = 0, b = 0, c = 0] = articles;

    await db.transaction(async (tx) => await save(tx, [a, b, c]));
    await db.transaction(async (tx) => await save(tx, [b]));

    expect(await ranked()).toEqual([b]);
  });
});

describe("article spotlights under two writers", () => {
  test("a spotlight added while another write holds the pages' lock waits for it, and both land on the page", async () => {
    const { articles } = await setupTwoWriters();
    const storeId = await theStoreId(db);
    const pageId = await findHomePageId(db, { storeId });
    const [a = 0, b = 0] = articles;
    const values = (productId: number) => ({
      labelEn: null,
      labelEs: "Nuevo",
      pageId,
      phraseEn: null,
      phraseEs: null,
      productId,
    });
    const made: number[] = [];
    committed.restore.unshift(async () => {
      await db.delete(spotlight).where(inArray(spotlight.id, made));
    });
    const held = deferred();
    const locked = deferred();
    const first = db.transaction(async (tx) => {
      const created = await createSpotlight(tx, { storeId, values: values(a) });
      made.push(created.id);
      locked.resolve(undefined);
      await held.promise;

      return created;
    });
    await Promise.race([locked.promise, first]);
    const pid: { resolve: (value: number) => void } = {
      resolve: () => undefined,
    };
    const secondPid = new Promise<number>((resolve) => {
      pid.resolve = resolve;
    });
    const second = db.transaction(async (tx) => {
      pid.resolve(await backendOf(tx));
      const created = await createSpotlight(tx, { storeId, values: values(b) });
      made.push(created.id);

      return created;
    });
    const settled: { results: PromiseSettledResult<unknown>[] } = {
      results: [],
    };

    // Both writers end before the teardown, whatever the wait does: a
    // second writer that fails before it says its process ends the wait
    // too, instead of leaving the first holding the lock.
    try {
      await waitUntilBlocked(await readyOrFailed(secondPid, second), storeId);
    } finally {
      held.resolve(undefined);
      settled.results = await Promise.allSettled([first, second]);
    }

    const { results } = settled;

    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    // Each went first in the sequence the other left: the second on top.
    const placed = (
      await db
        .select({ spotlightId: pageSection.spotlightId })
        .from(pageSection)
        .where(eq(pageSection.pageId, pageId))
        .orderBy(asc(pageSection.position))
    ).flatMap((row) => (row.spotlightId === null ? [] : [row.spotlightId]));
    expect(placed.slice(0, 2)).toEqual([made[1], made[0]]);
  });
});
