import type { APIRequestContext } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { UpdateComingSoonValues } from "../../lib/schemas/coming-soon";
import type { SavePageLayoutValues } from "../../lib/schemas/page";
import type { UpdateStoreValues } from "../../lib/schemas/store";
import { banner, product, store } from "../../server/db/schema";
import {
  DEFAULT_COMING_SOON,
  type Storefront,
  waitForStorefront,
  writeComingSoonTexts,
  writeStorefront,
} from "./coming-soon";
import { test as dbTest } from "./db.fixture";
import {
  STORE_ANNOUNCEMENT,
  STORE_SETTINGS,
  writeStoreAnnouncement,
  writeStoreSettings,
} from "./store-settings";
import {
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  workerBaseURL,
} from "./user.fixture";

/** Changes to the store's settings for one serial test. */
export interface StoreEdit {
  /**
   * Sends `body` to `store.update` as an admin, whatever it holds, and
   * answers the status: for the edits the API must refuse.
   */
  send: (body: Record<string, unknown>) => Promise<number>;
  /**
   * Writes `STORE_SETTINGS` with `changes` over them through `store.update`,
   * as an admin, and requires the write to succeed.
   */
  update: (changes: Partial<UpdateStoreValues>) => Promise<void>;
}

/** Changes to the coming-soon page for one test of the `closed` project. */
export interface ComingSoonEdit {
  /** Flips the switch as an admin, and waits until the public sees it. */
  setStorefront: (storefront: Storefront) => Promise<void>;
  /** Writes the page's texts and day as an admin. */
  update: (values: UpdateComingSoonValues) => Promise<void>;
}

/** The home's curation for one serial test (FER-020, FER-022). */
export interface HomeEdit {
  /**
   * Features the article `productId` in a spotlight (FER-059) through
   * `page.createSpotlight`, as an admin, first on the home page, right
   * under the cover; answers its id. The test's end deletes it.
   */
  addSpotlight: (
    productId: number,
    words: {
      labelEn?: string;
      labelEs?: string;
      phraseEn?: string;
      phraseEs?: string;
    }
  ) => Promise<number>;
  /** The run's announcement, which the test's end writes back. */
  announcement: typeof STORE_ANNOUNCEMENT;
  /**
   * Adds a page of the store (FER-060) through `page.create`, as an admin,
   * at `/<slug>`, published unless told otherwise, with the rows of
   * `categoryIds` in that order; answers its id. The test's end deletes
   * it, as every page the test made through the admin.
   */
  addPage: (values: {
    categoryIds?: number[];
    isPublished?: boolean;
    nameEs: string;
    showInHeader?: boolean;
    slug: string;
  }) => Promise<number>;
  /**
   * Leaves the home nothing to show until the test ends (FER-022's empty
   * store): every published article of the store becomes a draft and every
   * banner on is switched off, then the home's cached read is dropped.
   * The test's end puts each back as it was, before the order is saved.
   */
  hideEverything: () => Promise<void>;
  /** The home's order as `page.get` reads it now. */
  read: () => Promise<HomeSnapshot>;
  /**
   * Saves the home's order whole through `page.saveLayout`, as an admin,
   * which drops the home's cached read; it must succeed.
   */
  saveLayout: (values: SavePageLayoutValues) => Promise<void>;
}

export interface StoreFixtures {
  /**
   * See `ComingSoonEdit`. The page's empty texts and the closed store are
   * written back when the test ends, whatever it did. Only a
   * `*.closed.e2e.ts` spec may ask for it.
   */
  comingSoonEdit: ComingSoonEdit;
  /**
   * For a spec that changes the home's curation (FER-020), which every
   * spec's storefront shows: when the test ends, whatever it did, what
   * `hideEverything` hid shows again, the banners it added are deleted
   * (those `page.get` lists that it did not list as the test started) and
   * the article spotlights it added, the
   * home's order is saved back as it was, and the run's announcement
   * (`STORE_ANNOUNCEMENT`) is written back. Only a `*.serial.e2e.ts` spec
   * may ask for it.
   */
  homeEdit: HomeEdit;
  /**
   * See `StoreEdit`. The run's settings are written back when the test ends,
   * whatever it did. Only a `*.serial.e2e.ts` spec may ask for it.
   */
  storeEdit: StoreEdit;
}

/** What `page.get` answers of the home that its teardown puts back. */
export interface HomeSnapshot extends SavePageLayoutValues {
  banners: { id: number }[];
  spotlights: { id: number }[];
  /** The page the store shows at `/` (FER-058). */
  pageId: number;
}

/** Calls one of the pages' procedures as an admin; it must succeed. */
async function callHome(
  request: APIRequestContext,
  procedure: string,
  input: unknown
): Promise<unknown> {
  const response = await request.post(`/api/orpc/page/${procedure}`, {
    data: input === undefined ? {} : { json: input },
  });

  if (response.status() !== 200) {
    throw new Error(
      `page.${procedure} answered ${response.status()}: ${await response.text()}`
    );
  }

  const body: { json: unknown } = await response.json();

  return body.json;
}

/**
 * One place of a page's sequence, as `page.get` answers it. Written here,
 * not imported: the app's schema module reaches its siblings through the
 * `@/` alias, which Playwright's loader does not resolve.
 */
const pageSectionSchema = z.discriminatedUnion("kind", [
  z.object({ categoryId: z.number(), kind: z.literal("category") }),
  z.object({ kind: z.literal("best_sellers") }),
  z.object({ kind: z.literal("featured") }),
  z.object({ bannerId: z.number(), kind: z.literal("banner") }),
  z.object({ kind: z.literal("spotlight"), spotlightId: z.number() }),
]);

/** What the teardown reads of `page.get`'s answer; the rest is dropped. */
const homeSnapshotSchema = z.object({
  pageId: z.number(),
  banners: z.array(z.object({ id: z.number() })),
  coverBannerIds: z.array(z.number()),
  featuredProductIds: z.array(z.number()),
  rankingProductIds: z.array(z.number()),
  sections: z.array(pageSectionSchema),
  spotlights: z.array(z.object({ id: z.number() })),
});

/** The home page as `page.get` reads it now. */
async function readHome(
  request: APIRequestContext,
  pageId: number
): Promise<HomeSnapshot> {
  return homeSnapshotSchema.parse(await callHome(request, "get", { pageId }));
}

export interface StoreWorkerFixtures {
  /**
   * The position of the coming-soon switch while this worker's tests run:
   * `open` everywhere but the `closed` project (FER-034).
   */
  storefront: Storefront;
  /** Puts the switch where `storefront` says, before the worker's tests. */
  storefrontSwitch: Storefront;
  /** The settings the store holds while this worker's tests run. */
  storeSettings: typeof STORE_SETTINGS;
}

/** What only one test at a time may do: the serial project's specs. */
const SERIAL_SPEC = ".serial.e2e.ts";

/** What sees the store closed: the `closed` project's specs, run alone. */
const CLOSED_SPEC = ".closed.e2e.ts";

export const test = dbTest.extend<StoreFixtures, StoreWorkerFixtures>({
  storefront: ["open", { option: true, scope: "worker" }],

  // Before any test of the worker: a fresh database (CI's) is closed, since
  // no row reads as published, so every project but `closed` opens it, and
  // `closed` closes it with the dictionary's texts. The `closed` project
  // runs alone and first, and opens the store again when its worker ends, so
  // no other spec ever sees it closed.
  storefrontSwitch: [
    async ({ playwright, storefront, workerUser }, use) => {
      const baseURL = workerBaseURL();
      const admin = await playwright.request.newContext({
        baseURL,
        ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
        storageState: workerUser.storageState,
      });

      try {
        if (storefront === "closed") {
          await writeComingSoonTexts(admin, DEFAULT_COMING_SOON);
        }

        await writeStorefront(admin, storefront);
        await waitForStorefront(baseURL, storefront);
        await use(storefront);

        if (storefront === "closed") {
          await writeStorefront(admin, "open");
          await waitForStorefront(baseURL, "open");
        }
      } finally {
        await admin.dispose();
      }
    },
    { auto: true, scope: "worker" },
  ],

  comingSoonEdit: async (
    { baseURL, playwright, storefront, workerUser },
    use,
    testInfo
  ) => {
    // The other projects run in parallel and read the open store.
    if (!testInfo.file.endsWith(CLOSED_SPEC) || storefront !== "closed") {
      throw new Error(
        `Only a *.closed.e2e.ts spec may change the coming-soon page: ${testInfo.file}`
      );
    }

    const url = requireBaseURL(baseURL);
    const admin = await playwright.request.newContext({
      baseURL: url,
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: workerUser.storageState,
    });

    try {
      await use({
        setStorefront: async (position) => {
          await writeStorefront(admin, position);
          await waitForStorefront(url, position);
        },
        update: async (values) => {
          await writeComingSoonTexts(admin, values);
        },
      });
    } finally {
      // Whatever the test did or failed to do, the next one reads these.
      try {
        await writeComingSoonTexts(admin, DEFAULT_COMING_SOON);
        await writeStorefront(admin, "closed");
        await waitForStorefront(url, "closed");
      } finally {
        await admin.dispose();
      }
    }
  },
  // Before any test of the worker, whatever the spec: the values are the same
  // in every worker, so one starting while another runs changes nothing it
  // reads, and the edit drops whatever an earlier run left cached.
  storeSettings: [
    async ({ playwright, workerUser }, use) => {
      const request = await playwright.request.newContext({
        baseURL: workerBaseURL(),
        ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
        storageState: workerUser.storageState,
      });

      try {
        await writeStoreSettings(request, STORE_SETTINGS);
        // The bar every store page shows (FER-020), as global as the rest.
        await writeStoreAnnouncement(request, STORE_ANNOUNCEMENT);
      } finally {
        await request.dispose();
      }

      await use(STORE_SETTINGS);
    },
    { auto: true, scope: "worker" },
  ],

  homeEdit: async ({ baseURL, db, playwright, workerUser }, use, testInfo) => {
    // A parallel spec reads the home's bar while this one would change it.
    if (!testInfo.file.endsWith(SERIAL_SPEC)) {
      throw new Error(
        `Only a *.serial.e2e.ts spec may change the home's curation: ${testInfo.file}`
      );
    }

    const request = await playwright.request.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: workerUser.storageState,
    });
    const [own] = await db.drizzle
      .select({ homePageId: store.homePageId })
      .from(store)
      .where(eq(store.id, db.storeId));

    if (!own) {
      throw new Error("The store has no row");
    }

    const pageId = own.homePageId;
    const before = await readHome(request, pageId);
    const listPageIds = async () =>
      z
        .array(z.object({ id: z.number() }))
        .parse(await callHome(request, "list", undefined))
        .map((row) => row.id);
    // The pages before the test: any other it made goes when it ends.
    const keptPages = new Set(await listPageIds());
    const kept = new Set(before.banners.map((row) => row.id));
    const keptSpotlights = new Set(before.spotlights.map((row) => row.id));
    const hidden: { articleIds: number[]; bannerIds: number[] } = {
      articleIds: [],
      bannerIds: [],
    };
    const saveLayout = async (values: SavePageLayoutValues) => {
      await callHome(request, "saveLayout", { ...values, pageId });
    };

    try {
      await use({
        addPage: async ({
          categoryIds = [],
          isPublished = true,
          nameEs,
          showInHeader = false,
          slug,
        }) => {
          const created = z.object({ id: z.number() }).parse(
            await callHome(request, "create", {
              isPublished,
              nameEn: null,
              nameEs,
              seoDescriptionEn: null,
              seoDescriptionEs: null,
              seoTitleEn: null,
              seoTitleEs: null,
              showInHeader,
              slug,
            })
          );
          await callHome(request, "saveLayout", {
            coverBannerIds: [],
            featuredProductIds: before.featuredProductIds,
            pageId: created.id,
            rankingProductIds: before.rankingProductIds,
            sections: categoryIds.map((categoryId) => ({
              categoryId,
              kind: "category",
            })),
          } satisfies SavePageLayoutValues & { pageId: number });

          return created.id;
        },
        addSpotlight: async (productId, words) => {
          const created = z.object({ id: z.number() }).parse(
            await callHome(request, "createSpotlight", {
              labelEn: words.labelEn ?? null,
              labelEs: words.labelEs ?? null,
              pageId,
              phraseEn: words.phraseEn ?? null,
              phraseEs: words.phraseEs ?? null,
              productId,
              rowsIndex: 0,
            })
          );

          return created.id;
        },
        announcement: STORE_ANNOUNCEMENT,
        hideEverything: async () => {
          const articles = await db.drizzle
            .update(product)
            .set({ status: "draft" })
            .where(
              and(
                eq(product.storeId, db.storeId),
                eq(product.status, "published")
              )
            )
            .returning({ id: product.id });
          hidden.articleIds.push(...articles.map((row) => row.id));
          const banners = await db.drizzle
            .update(banner)
            .set({ isActive: false })
            .where(
              and(eq(banner.storeId, db.storeId), eq(banner.isActive, true))
            )
            .returning({ id: banner.id });
          hidden.bannerIds.push(...banners.map((row) => row.id));
          // Saving the order as it is drops the home's cached read.
          const now = await readHome(request, pageId);
          await saveLayout({
            coverBannerIds: now.coverBannerIds,
            featuredProductIds: now.featuredProductIds,
            rankingProductIds: now.rankingProductIds,
            sections: now.sections,
          });
        },
        read: async () => await readHome(request, pageId),
        saveLayout,
      });
    } finally {
      // Whatever the test did or failed to do, the next one reads these.
      try {
        // Shown again before the order is saved, which drops the cache.
        if (hidden.articleIds.length > 0) {
          await db.drizzle
            .update(product)
            .set({ status: "published" })
            .where(inArray(product.id, hidden.articleIds));
        }

        if (hidden.bannerIds.length > 0) {
          await db.drizzle
            .update(banner)
            .set({ isActive: true })
            .where(inArray(banner.id, hidden.bannerIds));
        }

        const after = await readHome(request, pageId);

        for (const { id } of after.banners.filter((row) => !kept.has(row.id))) {
          await callHome(request, "deleteBanner", { id });
        }

        for (const { id } of after.spotlights.filter(
          (row) => !keptSpotlights.has(row.id)
        )) {
          await callHome(request, "deleteSpotlight", { id });
        }

        await callHome(request, "saveLayout", {
          pageId,
          coverBannerIds: before.coverBannerIds,
          featuredProductIds: before.featuredProductIds,
          rankingProductIds: before.rankingProductIds,
          sections: before.sections,
        } satisfies SavePageLayoutValues & { pageId: number });
        await writeStoreAnnouncement(request, STORE_ANNOUNCEMENT);
        // The home back first: the page the test chose may be one it made.
        await callHome(request, "setHome", { pageId });

        for (const id of (await listPageIds()).filter(
          (page) => !keptPages.has(page)
        )) {
          await callHome(request, "delete", { id });
        }
      } finally {
        await request.dispose();
      }
    }
  },

  storeEdit: async ({ baseURL, playwright, workerUser }, use, testInfo) => {
    // A parallel spec reads these settings while this one would change them.
    if (!testInfo.file.endsWith(SERIAL_SPEC)) {
      throw new Error(
        `Only a *.serial.e2e.ts spec may change the store's settings: ${testInfo.file}`
      );
    }

    const request = await playwright.request.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: workerUser.storageState,
    });

    try {
      await use({
        send: async (body) => {
          const response = await request.post("/api/orpc/store/update", {
            data: { json: body },
          });

          return response.status();
        },
        update: async (changes) => {
          await writeStoreSettings(request, { ...STORE_SETTINGS, ...changes });
        },
      });
    } finally {
      // Whatever the test did or failed to do, the next one reads these.
      try {
        await writeStoreSettings(request, STORE_SETTINGS);
      } finally {
        await request.dispose();
      }
    }
  },
});
