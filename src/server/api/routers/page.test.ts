import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { pageRouter } from "./page";

// The router is input → the admin's login and store → service, writes inside
// the login's re-check, then what each changed dropped from the cache. The
// queries are `src/server/services/page.test.ts`'s.

// The handle `withAdmin` hands its write: distinct from the client, so a
// write that went through the outer client instead would be caught.
const { BLOB_STORE, OLD_PHOTO, TX } = vi.hoisted(() => ({
  BLOB_STORE: {
    host: "store9.public.blob.vercel-storage.com",
    namespace: "qa",
    token: "vercel_blob_rw_Store9_s3cretPart",
  },
  OLD_PHOTO:
    "https://store9.public.blob.vercel-storage.com/qa/banner/11111111-1111-4111-8111-111111111111.webp",
  TX: { handle: "the write's transaction" },
}));

const IMAGE = {
  height: 1067,
  url: "https://store9.public.blob.vercel-storage.com/qa/banner/22222222-2222-4222-8222-222222222222.webp",
  width: 1600,
};

const services = vi.hoisted(() => ({
  createBanner: vi.fn(async () => ({ id: 9 })),
  createPage: vi.fn(async () => ({ id: 12 })),
  createSpotlight: vi.fn(async () => ({ id: 51 })),
  deletePage: vi.fn(async () => ({ id: 12 })),
  invalidateHomeChoiceCache:
    vi.fn<(storeId: number, pageIds: readonly number[]) => void>(),
  invalidatePageSettingsCache:
    vi.fn<(storeId: number, pageIds?: readonly number[]) => void>(),
  listPages: vi.fn(async () => [{ id: 1, slug: "home" }]),
  setHomePage: vi.fn(async () => ({ homePageId: 12, previousHomeId: 1 })),
  updatePage: vi.fn(async () => ({
    id: 12,
    previousSlug: "regalos",
    slug: "navidad",
  })),
  deleteSpotlight: vi.fn(async () => ({ id: 51 })),
  updateSpotlight: vi.fn(async () => ({ id: 51 })),
  deleteBanner: vi.fn(async () => ({ discardedImageUrls: [OLD_PHOTO], id: 9 })),
  discardBlobs: vi.fn<(db: unknown, urls: readonly string[]) => void>(),
  findAdminStore: vi.fn(),
  getPageCuration: vi.fn(async () => ({ today: "2026-12-04" })),
  invalidateAnnouncementCache: vi.fn<(storeId: number) => void>(),
  invalidatePageCache: vi.fn<(storeId: number, pageId: number) => void>(),
  invalidatePagesCache: vi.fn<(storeId: number) => void>(),
  readBlobStore: vi.fn(() => BLOB_STORE),
  saveAnnouncement: vi.fn(async () => ({ id: 3 })),
  savePageLayout: vi.fn(async () => ({
    curatedChanged: false,
    sections: [],
  })),
  updateBanner: vi.fn(async () => ({ discardedImageUrls: [OLD_PHOTO], id: 9 })),
  withAdmin: vi.fn(
    async (
      _db: unknown,
      _userId: unknown,
      write: (handle: unknown) => Promise<unknown>
    ) => await write(TX)
  ),
}));

vi.mock("@/server/services/page", () => ({
  createBanner: services.createBanner,
  createSpotlight: services.createSpotlight,
  deleteSpotlight: services.deleteSpotlight,
  updateSpotlight: services.updateSpotlight,
  deleteBanner: services.deleteBanner,
  getPageCuration: services.getPageCuration,
  saveAnnouncement: services.saveAnnouncement,
  savePageLayout: services.savePageLayout,
  updateBanner: services.updateBanner,
}));

vi.mock("@/server/services/page-settings", () => ({
  createPage: services.createPage,
  deletePage: services.deletePage,
  listPages: services.listPages,
  setHomePage: services.setHomePage,
  updatePage: services.updatePage,
}));

// The files' deletion after the response is `blob-store.test.ts`'s.
vi.mock("@/server/api/utils/blob-store", () => ({
  discardBlobs: services.discardBlobs,
  readBlobStore: services.readBlobStore,
}));

vi.mock("@/server/services/access", () => ({
  findAdminStore: services.findAdminStore,
  withAdmin: services.withAdmin,
}));

// Next's cache only exists inside a Next render: the invalidations are
// spied on, the cached reads are `src/server/cache/page.test.ts`'s.
vi.mock("@/server/cache/page", () => ({
  invalidateAnnouncementCache: services.invalidateAnnouncementCache,
  invalidateHomeChoiceCache: services.invalidateHomeChoiceCache,
  invalidatePageSettingsCache: services.invalidatePageSettingsCache,
  invalidatePageCache: services.invalidatePageCache,
  invalidatePagesCache: services.invalidatePagesCache,
}));

vi.mock("@/server/cache/catalog", () => ({
  invalidateCatalogCache: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

const STORE = { id: 7 };
const USER_ID = "test-user-id";
// Built, so no `javascript:` literal sits in the source.
const SCRIPT_URL = ["javascript", "alert(1)"].join(":");

function makeAnnouncementInput(overrides: Record<string, unknown> = {}) {
  return {
    endsOn: null,
    isActive: true,
    linkUrl: " /productos ",
    shortTextEn: "",
    shortTextEs: null,
    startsOn: "2026-12-05",
    textEn: null,
    textEs: " Encontranos en la feria ",
    ...overrides,
  };
}

function makeBannerInput(overrides: Record<string, unknown> = {}) {
  return {
    ctaLabelEn: null,
    ctaLabelEs: null,
    endsOn: null,
    image: IMAGE,
    imagePhone: null,
    isActive: true,
    link: { categoryId: 4, kind: "category" },
    pageId: 3,
    placement: "rows",
    rowsIndex: 2,
    startsOn: null,
    titleEn: null,
    titleEs: "Burbujas",
    ...overrides,
  };
}

function makePageInput(overrides: Record<string, unknown> = {}) {
  return {
    isPublished: true,
    nameEn: "",
    nameEs: " Regalos ",
    seoDescriptionEn: "",
    seoDescriptionEs: "",
    seoTitleEn: "",
    seoTitleEs: "",
    showInHeader: false,
    slug: "regalos",
    ...overrides,
  };
}

function makeSpotlightInput(overrides: Record<string, unknown> = {}) {
  return {
    labelEn: "",
    labelEs: " Nuevo ",
    pageId: 3,
    phraseEn: null,
    phraseEs: null,
    productId: 40,
    ...overrides,
  };
}

/**
 * A signed-in admin working on the store (or a login the database no longer
 * has, or nobody).
 */
function setup({
  isLogin = true,
  signedIn = true,
}: { isLogin?: boolean; signedIn?: boolean } = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  services.findAdminStore.mockResolvedValue(isLogin ? STORE : null);
  const options = { context: mockCtx as never };
  const run = async (
    name: keyof typeof pageRouter,
    input: unknown
  ): Promise<unknown> =>
    await call(pageRouter[name] as never, input as never, options);

  return { db: mockCtx.db, run };
}

describe("page router", () => {
  test("reads a page's curation on the business day, outside any write", async () => {
    // 02:00 UTC is still December 4 in Montevideo.
    vi.setSystemTime(new Date("2026-12-05T02:00:00Z"));
    const { db, run } = setup();

    await expect(run("get", { pageId: "3" })).resolves.toEqual({
      today: "2026-12-04",
    });

    expect(services.findAdminStore).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID
    );
    expect(services.getPageCuration).toHaveBeenCalledExactlyOnceWith(db, {
      pageId: 3,
      storeId: 7,
      today: "2026-12-04",
    });
    expect(services.withAdmin).not.toHaveBeenCalled();
    expect(services.invalidatePagesCache).not.toHaveBeenCalled();
  });

  test("saves the announcement in the store, trimmed and blanks as none, then drops the cached bar only", async () => {
    const { db, run } = setup();

    await expect(
      run("saveAnnouncement", makeAnnouncementInput())
    ).resolves.toEqual({ id: 3 });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    expect(services.saveAnnouncement).toHaveBeenCalledExactlyOnceWith(TX, {
      storeId: 7,
      values: {
        endsOn: null,
        isActive: true,
        linkUrl: "/productos",
        shortTextEn: null,
        shortTextEs: null,
        startsOn: "2026-12-05",
        textEn: null,
        textEs: "Encontranos en la feria",
      },
    });
    expect(
      services.invalidateAnnouncementCache
    ).toHaveBeenCalledExactlyOnceWith(7);
    expect(
      services.invalidateAnnouncementCache.mock.invocationCallOrder[0]
    ).toBeGreaterThan(
      services.saveAnnouncement.mock.invocationCallOrder[0] ?? 0
    );
    expect(services.invalidatePagesCache).not.toHaveBeenCalled();
  });

  test("adds a banner with this deployment's Blob store, then drops every cached page", async () => {
    const { run } = setup();

    await expect(run("createBanner", makeBannerInput())).resolves.toEqual({
      id: 9,
    });

    expect(services.createBanner).toHaveBeenCalledExactlyOnceWith(TX, {
      blobStore: BLOB_STORE,
      storeId: 7,
      values: makeBannerInput(),
    });
    expect(services.invalidatePagesCache).toHaveBeenCalledExactlyOnceWith(7);
    expect(services.discardBlobs).not.toHaveBeenCalled();
  });

  test("edits a banner by id, then drops every cached page and its replaced photo's file", async () => {
    const { db, run } = setup();
    const { image: _image, ...input } = makeBannerInput();

    await expect(
      run("updateBanner", { ...input, id: "9", imagePhone: null })
    ).resolves.toEqual({ id: 9 });

    expect(services.updateBanner).toHaveBeenCalledExactlyOnceWith(TX, {
      blobStore: BLOB_STORE,
      storeId: 7,
      values: { ...input, id: 9, imagePhone: null },
    });
    expect(services.invalidatePagesCache).toHaveBeenCalledExactlyOnceWith(7);
    // The dropped file goes once the write committed.
    expect(services.discardBlobs).toHaveBeenCalledExactlyOnceWith(db, [
      OLD_PHOTO,
    ]);
    expect(services.discardBlobs.mock.invocationCallOrder[0]).toBeGreaterThan(
      services.updateBanner.mock.invocationCallOrder[0] ?? 0
    );
  });

  test("deletes a banner by id, then drops every cached page and its photos' files", async () => {
    const { db, run } = setup();

    await expect(run("deleteBanner", { id: "9" })).resolves.toEqual({ id: 9 });

    expect(services.deleteBanner).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 9,
      storeId: 7,
    });
    expect(services.invalidatePagesCache).toHaveBeenCalledExactlyOnceWith(7);
    expect(services.discardBlobs).toHaveBeenCalledExactlyOnceWith(db, [
      OLD_PHOTO,
    ]);
  });

  test.each([
    ["only that page", false, []],
    [
      "that page and every other, the curated lists having changed",
      true,
      [[7]],
    ],
  ])(
    "saves a page's order in the store, then drops %s",
    async (_case, curatedChanged, pages) => {
      const { run } = setup();
      services.savePageLayout.mockResolvedValueOnce({
        curatedChanged,
        sections: [],
      });
      const layout = {
        coverBannerIds: [2, 1],
        featuredProductIds: [],
        pageId: 3,
        rankingProductIds: [40],
        sections: [{ kind: "featured" }, { categoryId: 4, kind: "category" }],
      };

      // What the lists did is the cache's business, not the caller's.
      await expect(run("saveLayout", layout)).resolves.toEqual({
        sections: [],
      });

      expect(services.savePageLayout).toHaveBeenCalledExactlyOnceWith(TX, {
        storeId: 7,
        values: layout,
      });
      expect(services.invalidatePageCache).toHaveBeenCalledExactlyOnceWith(
        7,
        3
      );
      expect(services.invalidatePagesCache.mock.calls).toEqual(pages);
    }
  );

  test.each([
    [
      "adds an article spotlight",
      "createSpotlight",
      makeSpotlightInput({ rowsIndex: 0 }),
      services.createSpotlight,
      {
        labelEn: null,
        labelEs: "Nuevo",
        pageId: 3,
        phraseEn: null,
        phraseEs: null,
        productId: 40,
        rowsIndex: 0,
      },
    ],
    [
      "edits an article spotlight by id",
      "updateSpotlight",
      makeSpotlightInput({ id: "51" }),
      services.updateSpotlight,
      {
        id: 51,
        labelEn: null,
        labelEs: "Nuevo",
        pageId: 3,
        phraseEn: null,
        phraseEs: null,
        productId: 40,
      },
    ],
  ] as const)(
    "%s, trimmed and blanks as none, then drops every cached page",
    async (_case, name, input, service, values) => {
      const { run } = setup();

      await expect(run(name, input)).resolves.toEqual({ id: 51 });

      expect(service).toHaveBeenCalledExactlyOnceWith(TX, {
        storeId: 7,
        values,
      });
      expect(services.invalidatePagesCache).toHaveBeenCalledExactlyOnceWith(7);
    }
  );

  test("deletes an article spotlight by id, then drops every cached page", async () => {
    const { run } = setup();

    await expect(run("deleteSpotlight", { id: "51" })).resolves.toEqual({
      id: 51,
    });

    expect(services.deleteSpotlight).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 51,
      storeId: 7,
    });
    expect(services.invalidatePagesCache).toHaveBeenCalledExactlyOnceWith(7);
  });

  test("keeps the cache when a write fails", async () => {
    const { run } = setup();
    services.deleteBanner.mockRejectedValueOnce(new Error("Banner gone"));

    await expect(run("deleteBanner", { id: 9 })).rejects.toThrow("Banner gone");
    expect(services.invalidatePagesCache).not.toHaveBeenCalled();
    expect(services.discardBlobs).not.toHaveBeenCalled();
  });

  test("lists the store's pages outside any write", async () => {
    const { db, run } = setup();

    await expect(run("list", undefined)).resolves.toEqual([
      { id: 1, slug: "home" },
    ]);
    expect(services.listPages).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: 7,
    });
    expect(services.withAdmin).not.toHaveBeenCalled();
  });

  test("creates a page in the store, trimmed and blanks as none, then drops the pages' settings only", async () => {
    const { run } = setup();

    await expect(run("create", makePageInput())).resolves.toEqual({ id: 12 });

    expect(services.createPage).toHaveBeenCalledExactlyOnceWith(TX, {
      storeId: 7,
      values: makePageInput({
        nameEn: null,
        nameEs: "Regalos",
        seoDescriptionEn: null,
        seoDescriptionEs: null,
        seoTitleEn: null,
        seoTitleEs: null,
      }),
    });
    expect(
      services.invalidatePageSettingsCache
    ).toHaveBeenCalledExactlyOnceWith(7, []);
    expect(services.invalidatePagesCache).not.toHaveBeenCalled();
  });

  test("edits a page, answering its id and address, then drops its settings and its own read", async () => {
    const { run } = setup();

    await expect(
      run("update", makePageInput({ id: 12, slug: "navidad" }))
    ).resolves.toEqual({ id: 12, slug: "navidad" });

    expect(services.updatePage).toHaveBeenCalledExactlyOnceWith(TX, {
      storeId: 7,
      values: expect.objectContaining({ id: 12, slug: "navidad" }),
    });
    expect(
      services.invalidatePageSettingsCache
    ).toHaveBeenCalledExactlyOnceWith(7, [12]);
  });

  test("deletes a page of the store, then drops its settings and its own read", async () => {
    const { run } = setup();

    await expect(run("delete", { id: 12 })).resolves.toEqual({ id: 12 });

    expect(services.deletePage).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 12,
      storeId: 7,
    });
    expect(
      services.invalidatePageSettingsCache
    ).toHaveBeenCalledExactlyOnceWith(7, [12]);
  });

  test("chooses the home, then drops what `/` shows and both pages involved", async () => {
    const { run } = setup();

    await expect(run("setHome", { pageId: "12" })).resolves.toEqual({
      homePageId: 12,
      previousHomeId: 1,
    });

    expect(services.setHomePage).toHaveBeenCalledExactlyOnceWith(TX, {
      pageId: 12,
      storeId: 7,
    });
    expect(services.invalidateHomeChoiceCache).toHaveBeenCalledExactlyOnceWith(
      7,
      [1, 12]
    );
  });

  test("keeps the pages' cache when a page's write is refused", async () => {
    const { run } = setup();
    services.deletePage.mockRejectedValueOnce(new Error("Page is the home"));

    await expect(run("delete", { id: 1 })).rejects.toThrow("Page is the home");
    expect(services.invalidatePageSettingsCache).not.toHaveBeenCalled();
  });

  test.each([
    ["create", makePageInput({ slug: "Regalos de Navidad" })],
    ["create", makePageInput({ nameEs: "  " })],
    ["update", makePageInput({ id: 12, slug: "productos" })],
    ["setHome", { pageId: "0" }],
  ] as const)(
    "%s with input the schema refuses is BAD_REQUEST, before any service",
    async (name, input) => {
      const { run } = setup();

      await expect(run(name, input)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(services.withAdmin).not.toHaveBeenCalled();
    }
  );

  test.each([
    ["list", undefined, services.listPages],
    ["create", makePageInput(), services.createPage],
    ["update", makePageInput({ id: 12 }), services.updatePage],
    ["delete", { id: 12 }, services.deletePage],
    ["setHome", { pageId: 12 }, services.setHomePage],
  ] as const)(
    "%s by a login the database no longer has is UNAUTHORIZED, before the service",
    async (name, input, service) => {
      const { run } = setup({ isLogin: false });

      await expect(run(name, input)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
      expect(service).not.toHaveBeenCalled();
      expect(services.invalidatePageSettingsCache).not.toHaveBeenCalled();
      expect(services.invalidateHomeChoiceCache).not.toHaveBeenCalled();
    }
  );

  test.each([
    ["get", { pageId: 3 }, services.getPageCuration],
    ["deleteBanner", { id: 9 }, services.deleteBanner],
    ["saveAnnouncement", makeAnnouncementInput(), services.saveAnnouncement],
  ] as const)(
    "%s by a login the database no longer has is UNAUTHORIZED, before the service",
    async (name, input, service) => {
      const { run } = setup({ isLogin: false });

      await expect(run(name, input)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
      expect(services.withAdmin).not.toHaveBeenCalled();
      expect(service).not.toHaveBeenCalled();
      expect(services.invalidatePagesCache).not.toHaveBeenCalled();
    }
  );

  test("a signed-out caller is UNAUTHORIZED, before the login is read", async () => {
    const { run } = setup({ signedIn: false });

    await expect(run("createBanner", makeBannerInput())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(services.findAdminStore).not.toHaveBeenCalled();
    expect(services.createBanner).not.toHaveBeenCalled();
  });

  test.each([
    ["saveAnnouncement", makeAnnouncementInput({ linkUrl: SCRIPT_URL })],
    ["saveAnnouncement", makeAnnouncementInput({ textEs: "  " })],
    [
      "createBanner",
      makeBannerInput({ link: { kind: "url", url: "//evil.example" } }),
    ],
    [
      "createBanner",
      makeBannerInput({ image: { ...IMAGE, url: "http://x.com/a.webp" } }),
    ],
    ["updateBanner", { ...makeBannerInput(), id: "0" }],
    ["deleteBanner", { id: "" }],
    [
      "saveLayout",
      {
        coverBannerIds: [],
        featuredProductIds: [1],
        pageId: 3,
        rankingProductIds: [],
        sections: [],
      },
    ],
    [
      "saveLayout",
      {
        coverBannerIds: [],
        featuredProductIds: [],
        rankingProductIds: [],
        sections: [],
      },
    ],
    ["get", { pageId: "0" }],
    ["createSpotlight", makeSpotlightInput({ productId: undefined })],
    ["createSpotlight", makeSpotlightInput({ labelEs: "x".repeat(25) })],
    ["createSpotlight", makeSpotlightInput({ phraseEn: "x".repeat(141) })],
    ["createSpotlight", makeSpotlightInput({ rowsIndex: -1 })],
    ["updateSpotlight", makeSpotlightInput({ id: "0" })],
    ["deleteSpotlight", { id: "" }],
    ["createBanner", makeBannerInput({ pageId: undefined })],
  ] as const)(
    "refuses invalid %s input before reading the login",
    async (name, input) => {
      const { run } = setup();

      await expect(run(name, input)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Input validation failed",
      });
      expect(services.findAdminStore).not.toHaveBeenCalled();
    }
  );
});
