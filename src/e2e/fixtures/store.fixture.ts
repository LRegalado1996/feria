import type { APIRequestContext } from "@playwright/test";
import { z } from "zod";

import type { UpdateComingSoonValues } from "../../lib/schemas/coming-soon";
import type { SaveHomeLayoutValues } from "../../lib/schemas/home";
import type { UpdateStoreValues } from "../../lib/schemas/store";
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

export interface StoreFixtures {
  /**
   * See `ComingSoonEdit`. The page's empty texts and the closed store are
   * written back when the test ends, whatever it did. Only a
   * `*.closed.e2e.ts` spec may ask for it.
   */
  comingSoonEdit: ComingSoonEdit;
  /**
   * For a spec that changes the home's curation (FER-020), which every
   * spec's storefront shows: when the test ends, whatever it did, the
   * banners it added are deleted (those `home.get` lists that it did not
   * list as the test started), the home's order is saved back as it was,
   * and the run's announcement (`STORE_ANNOUNCEMENT`) is written back.
   * Only a `*.serial.e2e.ts` spec may ask for it; it gives the announcement
   * it writes back.
   */
  homeEdit: typeof STORE_ANNOUNCEMENT;
  /**
   * See `StoreEdit`. The run's settings are written back when the test ends,
   * whatever it did. Only a `*.serial.e2e.ts` spec may ask for it.
   */
  storeEdit: StoreEdit;
}

/** What `home.get` answers that the home's teardown puts back. */
interface HomeSnapshot extends SaveHomeLayoutValues {
  banners: { id: number }[];
}

/** Calls one of the home's procedures as an admin; it must succeed. */
async function callHome(
  request: APIRequestContext,
  procedure: string,
  input: unknown
): Promise<unknown> {
  const response = await request.post(`/api/orpc/home/${procedure}`, {
    data: input === undefined ? {} : { json: input },
  });

  if (response.status() !== 200) {
    throw new Error(
      `home.${procedure} answered ${response.status()}: ${await response.text()}`
    );
  }

  const body: { json: unknown } = await response.json();

  return body.json;
}

/**
 * One place of the home's sequence, as `home.get` answers it. Written here,
 * not imported: the app's schema module reaches its siblings through the
 * `@/` alias, which Playwright's loader does not resolve.
 */
const homeSectionSchema = z.discriminatedUnion("kind", [
  z.object({ categoryId: z.number(), kind: z.literal("category") }),
  z.object({ kind: z.literal("best_sellers") }),
  z.object({ kind: z.literal("featured") }),
  z.object({ bannerId: z.number(), kind: z.literal("banner") }),
]);

/** What the teardown reads of `home.get`'s answer; the rest is dropped. */
const homeSnapshotSchema = z.object({
  banners: z.array(z.object({ id: z.number() })),
  coverBannerIds: z.array(z.number()),
  featuredProductIds: z.array(z.number()),
  rankingProductIds: z.array(z.number()),
  sections: z.array(homeSectionSchema),
});

/** The home as `home.get` reads it now. */
async function readHome(request: APIRequestContext): Promise<HomeSnapshot> {
  return homeSnapshotSchema.parse(await callHome(request, "get", undefined));
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

  homeEdit: async ({ baseURL, playwright, workerUser }, use, testInfo) => {
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
    const before = await readHome(request);
    const kept = new Set(before.banners.map((row) => row.id));

    try {
      await use(STORE_ANNOUNCEMENT);
    } finally {
      // Whatever the test did or failed to do, the next one reads these.
      try {
        const after = await readHome(request);

        for (const { id } of after.banners.filter((row) => !kept.has(row.id))) {
          await callHome(request, "deleteBanner", { id });
        }

        await callHome(request, "saveLayout", {
          coverBannerIds: before.coverBannerIds,
          featuredProductIds: before.featuredProductIds,
          rankingProductIds: before.rankingProductIds,
          sections: before.sections,
        } satisfies SaveHomeLayoutValues);
        await writeStoreAnnouncement(request, STORE_ANNOUNCEMENT);
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
