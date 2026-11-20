import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  CreateBannerValues,
  SaveAnnouncementValues,
  SaveHomeLayoutValues,
} from "@/lib/schemas/home";
import { type DatabaseClient, db } from "@/server/db";
import {
  announcement,
  banner,
  category,
  categoryTranslation,
  featuredProduct,
  homeSection,
  product,
  productTranslation,
  rankingEntry,
} from "@/server/db/schema";
import { theStoreId, uniqueTag } from "@/server/test/one-store";

import {
  createBanner,
  deleteBanner,
  findShowingAnnouncement,
  getHomeContent,
  getHomeCuration,
  saveAnnouncement,
  saveHomeLayout,
  updateBanner,
} from "./home";

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
  overrides: Partial<CreateBannerValues> = {}
): CreateBannerValues {
  return {
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
async function clearHome(tx: DatabaseClient, storeId: number) {
  await tx.delete(announcement).where(eq(announcement.storeId, storeId));
  await tx.delete(banner).where(eq(banner.storeId, storeId));
  await tx.delete(homeSection).where(eq(homeSection.storeId, storeId));
  await tx.delete(rankingEntry).where(eq(rankingEntry.storeId, storeId));
  await tx.delete(featuredProduct).where(eq(featuredProduct.storeId, storeId));
}

/**
 * Runs `work` on a home with no curation, in a transaction that is rolled
 * back: the announcement, the sequence and the curated rows are the store's
 * one set, which every file of the worker shares.
 */
async function onEmptyHome(
  work: (tx: DatabaseClient, storeId: number) => Promise<void>
) {
  const run = db.transaction(async (tx) => {
    const storeId = await theStoreId(tx);
    await clearHome(tx, storeId);
    await work(tx, storeId);

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
  return await getHomeContent(tx, {
    currencyCode: "UYU",
    locale,
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
      expect((await readContent(tx, storeId)).announcement).toEqual(expected);
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
    await onEmptyHome(async (tx, storeId) => {
      const values = bannerValues(days);
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
    await onEmptyHome(async (tx, storeId) => {
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
          values: bannerValues({ link }),
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
    await onEmptyHome(async (tx, storeId) => {
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
      await saveHomeLayout(tx, {
        storeId,
        values: {
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
            section.kind === "banner"
              ? []
              : section.articles.map((card) => [card.id, card.isAvailable]),
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
    await onEmptyHome(async (tx, storeId) => {
      const shelf = await addCategory(tx, storeId);
      await addArticle(tx, { categoryId: shelf.id, storeId });
      const shown = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues({ placement: "rows", rowsIndex: 0 }),
      });
      const off = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues({
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
    await onEmptyHome(async (tx, storeId) => {
      await expect(
        createBanner(tx, {
          blobStore: BLOB_STORE,
          storeId,
          values: bannerValues({ image }),
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "A banner photo must be one uploaded to this store",
      });
    });
  });

  test("a deployment without a Blob store takes no new photo", async () => {
    await onEmptyHome(async (tx, storeId) => {
      await expect(
        createBanner(tx, { blobStore: null, storeId, values: bannerValues() })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "A banner photo must be one uploaded to this store",
      });
    });
  });

  test("refuses a link to an article or a category the store does not have", async () => {
    await onEmptyHome(async (tx, storeId) => {
      const shelf = await addCategory(tx, storeId);
      const gone = await addArticle(tx, { categoryId: shelf.id, storeId });
      await tx.delete(product).where(eq(product.id, gone.id));
      await tx.delete(category).where(eq(category.id, shelf.id));

      await expect(
        createBanner(tx, {
          blobStore: BLOB_STORE,
          storeId,
          values: bannerValues({
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
          values: bannerValues({
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
    await onEmptyHome(async (tx, storeId) => {
      const [seeded] = await tx
        .insert(banner)
        .values({
          coverPosition: 0,
          imageHeight: 800,
          imagePhoneHeight: 800,
          imagePhoneUrl: "/seed/ring-3-phone.jpg",
          imagePhoneWidth: 800,
          imageUrl: "/seed/ring-3.jpg",
          imageWidth: 1200,
          placement: "cover",
          storeId,
        })
        .returning({ id: banner.id });
      const id = seeded?.id ?? 0;
      const fields = { ...bannerValues(), id };
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
    await onEmptyHome(async (tx, storeId) => {
      const first = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues(),
      });
      const moving = bannerValues();
      const { id } = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: moving,
      });
      const { image: _image, imagePhone: _phone, ...words } = moving;
      const placeOf = async () =>
        (await getHomeCuration(tx, { storeId, today: TODAY })).sections
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
        (await getHomeCuration(tx, { storeId, today: TODAY })).coverBannerIds
      ).toEqual([first.id]);

      await updateBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: { ...words, id, placement: "cover" },
      });

      expect(await placeOf()).toBe(-1);
      expect(
        (await getHomeCuration(tx, { storeId, today: TODAY })).coverBannerIds
      ).toEqual([first.id, id]);
    });
  });

  test("the cover takes a sixth banner and refuses a seventh, new or moved in; one in it is still edited", async () => {
    await onEmptyHome(async (tx, storeId) => {
      const create = async (values: CreateBannerValues) =>
        await createBanner(tx, { blobStore: BLOB_STORE, storeId, values });
      const covered: number[] = [];

      for (let index = 0; index < 6; index += 1) {
        covered.push((await create(bannerValues())).id);
      }

      const full = {
        code: "CONFLICT",
        message: "The cover holds at most 6 banners",
      };
      await expect(create(bannerValues())).rejects.toMatchObject(full);
      const between = bannerValues({ placement: "rows" });
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
        (await getHomeCuration(tx, { storeId, today: TODAY })).coverBannerIds
      ).toEqual(covered);
    });
  });
});

describe("saving the home's order", () => {
  test("refuses what the store does not have, and a banner listed in the place it is not in", async () => {
    await onEmptyHome(async (tx, storeId) => {
      const shelf = await addCategory(tx, storeId);
      const gone = await addArticle(tx, { categoryId: shelf.id, storeId });
      await tx.delete(product).where(eq(product.id, gone.id));
      const cover = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues(),
      });
      const rows = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues({ placement: "rows" }),
      });
      const save = async (values: Partial<SaveHomeLayoutValues>) =>
        await saveHomeLayout(tx, {
          storeId,
          values: {
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
    await onEmptyHome(async (tx, storeId) => {
      const one = await addCategory(tx, storeId);
      const two = await addCategory(tx, storeId);
      const a = await addArticle(tx, { categoryId: one.id, storeId });
      const b = await addArticle(tx, { categoryId: two.id, storeId });
      const c = await addArticle(tx, { categoryId: two.id, storeId });
      const first = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues(),
      });
      const second = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues(),
      });
      const between = await createBanner(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: bannerValues({ placement: "rows" }),
      });

      await saveHomeLayout(tx, {
        storeId,
        values: {
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
          bannerId: homeSection.bannerId,
          categoryId: homeSection.categoryId,
          kind: homeSection.kind,
          position: homeSection.position,
        })
        .from(homeSection)
        .where(eq(homeSection.storeId, storeId))
        .orderBy(asc(homeSection.position));
      expect(saved.slice(0, 5)).toEqual([
        { bannerId: null, categoryId: two.id, kind: "category", position: 0 },
        { bannerId: null, categoryId: null, kind: "featured", position: 1 },
        { bannerId: between.id, categoryId: null, kind: "banner", position: 2 },
        { bannerId: null, categoryId: one.id, kind: "category", position: 3 },
        { bannerId: null, categoryId: null, kind: "best_sellers", position: 4 },
      ]);
      // The store's other categories, left out, come after, numbered on.
      expect(saved.map((row) => row.position)).toEqual(
        saved.map((_row, index) => index)
      );
      expect(saved.slice(5).every((row) => row.kind === "category")).toBe(true);
      const curation = await getHomeCuration(tx, { storeId, today: TODAY });
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
            .select({ categoryId: homeSection.categoryId })
            .from(homeSection)
            .where(
              and(
                eq(homeSection.storeId, storeId),
                eq(homeSection.kind, "category")
              )
            )
        ).map((row) => row.categoryId)
      ).not.toContain(one.id);
      expect(
        (await getHomeCuration(tx, { storeId, today: TODAY })).sections
      ).not.toContainEqual({ categoryId: one.id, kind: "category" });
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

/** Waits until some query on this database waits on another's lock. */
async function waitUntilBlocked() {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const result = await db.execute<{ blocked: number }>(sql`
      select count(*)::int as blocked
      from pg_stat_activity
      where datname = current_database()
        and cardinality(pg_blocking_pids(pid)) > 0
    `);

    if ((result.rows[0]?.blocked ?? 0) > 0) {
      return;
    }
  }

  throw new Error("The second writer never waited on the home's lock");
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
 * Keeps the store's sequence and curated rows as they are now, to be put
 * back after the test, and adds a category with three articles to rank.
 */
async function setupTwoWriters() {
  const storeId = await theStoreId(db);
  const sections = await db
    .select({
      bannerId: homeSection.bannerId,
      categoryId: homeSection.categoryId,
      kind: homeSection.kind,
      position: homeSection.position,
      storeId: homeSection.storeId,
    })
    .from(homeSection)
    .where(eq(homeSection.storeId, storeId));
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
  committed.restore.push(async () => {
    await db.transaction(async (tx) => {
      await tx.delete(homeSection).where(eq(homeSection.storeId, storeId));
      await tx.delete(rankingEntry).where(eq(rankingEntry.storeId, storeId));
      await tx
        .delete(featuredProduct)
        .where(eq(featuredProduct.storeId, storeId));

      if (sections.length > 0) {
        await tx.insert(homeSection).values(sections);
      }

      if (ranking.length > 0) {
        await tx.insert(rankingEntry).values(ranking);
      }

      if (featured.length > 0) {
        await tx.insert(featuredProduct).values(featured);
      }
    });
  });
  const shelf = await addCategory(db, storeId);
  committed.categoryIds.push(shelf.id);
  const articles = [];

  for (let index = 0; index < 3; index += 1) {
    const article = await addArticle(db, { categoryId: shelf.id, storeId });
    committed.productIds.push(article.id);
    articles.push(article.id);
  }

  return {
    articles,
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
      await saveHomeLayout(tx, {
        storeId,
        values: {
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
    const { articles, ranked, save } = await setupTwoWriters();
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
    const second = db.transaction(async (tx) => await save(tx, [c, a]));

    try {
      await waitUntilBlocked();
    } finally {
      held.resolve(undefined);
    }

    const results = await Promise.allSettled([first, second]);

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
