import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { categoryRouter } from "./category";

// The router is input → the admin's login and store → service, writes inside
// the login's re-check. The queries are `src/server/services/category.test.ts`'s
// and the access rules `src/server/services/access.test.ts`'s.

// The handle `withAdmin` hands its write: distinct from the client, so a
// write that went through the outer client instead would be caught.
const { BLOB_STORE, OLD_COVER, TX } = vi.hoisted(() => ({
  BLOB_STORE: {
    host: "store9.public.blob.vercel-storage.com",
    namespace: "qa",
    token: "vercel_blob_rw_Store9_s3cretPart",
  },
  OLD_COVER:
    "https://store9.public.blob.vercel-storage.com/qa/cover/11111111-1111-4111-8111-111111111111.webp",
  TX: { handle: "the write's transaction" },
}));

const services = vi.hoisted(() => ({
  createCategory: vi.fn(async () => ({
    id: 11,
    position: 2,
    slug: "collares",
  })),
  deleteCategory: vi.fn(async () => ({
    discardedImageUrls: [OLD_COVER],
    id: 12,
    movedArticles: 3,
  })),
  discardBlobs: vi.fn<(db: unknown, urls: readonly string[]) => void>(),
  findAdminStore: vi.fn(),
  invalidateCatalogCache: vi.fn<(storeId: number) => void>(),
  listStoreCategories: vi.fn(async () => [
    {
      id: 1,
      nameEn: "Necklaces",
      nameEs: "Collares",
      position: 0,
      productCount: 4,
      slug: "collares",
    },
  ]),
  renameCategory: vi.fn(async () => ({ id: 13, slug: "collares" })),
  reorderCategories: vi.fn(async () => ({ ids: [3, 1, 2] })),
  readBlobStore: vi.fn(() => BLOB_STORE),
  updateCategoryPage: vi.fn(async () => ({
    discardedImageUrls: [OLD_COVER],
    id: 5,
    parentId: 6,
  })),
  withAdmin: vi.fn(
    async (
      _db: unknown,
      _userId: unknown,
      write: (handle: unknown) => Promise<unknown>
    ) => await write(TX)
  ),
}));

vi.mock("@/server/services/category", () => ({
  createCategory: services.createCategory,
  deleteCategory: services.deleteCategory,
  listStoreCategories: services.listStoreCategories,
  renameCategory: services.renameCategory,
  reorderCategories: services.reorderCategories,
  updateCategoryPage: services.updateCategoryPage,
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

// Next's cache only exists inside a Next render: the catalog's invalidation is
// spied on, its cached reads are `src/server/cache/catalog.test.ts`'s.
vi.mock("@/server/cache/catalog", () => ({
  invalidateCatalogCache: services.invalidateCatalogCache,
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

const STORE = { id: 7 };
const USER_ID = "test-user-id";

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
  const procedures = {
    create: async (input: unknown) =>
      await call(categoryRouter.create, input as never, options),
    delete: async (input: unknown) =>
      await call(categoryRouter.delete, input as never, options),
    list: async (input: unknown) =>
      await call(categoryRouter.list, input as never, options),
    rename: async (input: unknown) =>
      await call(categoryRouter.rename, input as never, options),
    reorder: async (input: unknown) =>
      await call(categoryRouter.reorder, input as never, options),
    updatePage: async (input: unknown) =>
      await call(categoryRouter.updatePage, input as never, options),
  };
  const run = async (name: keyof typeof procedures, input: unknown) =>
    await procedures[name](input);

  return { db: mockCtx.db, run };
}

describe("category router", () => {
  test("lists the store's categories, outside any write", async () => {
    const { db, run } = setup();

    await expect(run("list", undefined)).resolves.toEqual([
      {
        id: 1,
        nameEn: "Necklaces",
        nameEs: "Collares",
        position: 0,
        productCount: 4,
        slug: "collares",
      },
    ]);

    expect(services.findAdminStore).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID
    );
    expect(services.listStoreCategories).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: 7,
    });
    expect(services.withAdmin).not.toHaveBeenCalled();
  });

  test("creates the category in the store, a blank English name as none, then drops its cached catalog", async () => {
    const { db, run } = setup();

    await expect(
      run("create", {
        nameEn: "  ",
        nameEs: " Collares ",
      })
    ).resolves.toEqual({ id: 11, position: 2, slug: "collares" });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    expect(services.createCategory).toHaveBeenCalledExactlyOnceWith(TX, {
      storeId: 7,
      values: { nameEn: null, nameEs: "Collares" },
    });
    // Every store page's header and footer list the categories, an
    // article's static page included (FER-039).
    expect(services.invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(7);
  });

  test("renames by id within the store, then drops its cached catalog", async () => {
    const { db, run } = setup();

    await expect(
      run("rename", {
        id: "5",
        nameEn: "Necklaces",
        nameEs: "Collares",
      })
    ).resolves.toEqual({ id: 13, slug: "collares" });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    expect(services.renameCategory).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 5,
      storeId: 7,
      values: { nameEn: "Necklaces", nameEs: "Collares" },
    });
    expect(services.invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(7);
  });

  test("sets a category's page by id within the store, blank texts as none, then drops its cached catalog", async () => {
    const { db, run } = setup();

    await expect(
      run("updatePage", {
        coverAltEn: "",
        coverAltEs: " Anillo sello ",
        id: "5",
        parentId: 6,
        seoDescriptionEn: "  ",
        seoDescriptionEs: "Anillos de la feria",
        seoTitleEn: "Rings",
        seoTitleEs: "",
      })
    ).resolves.toEqual({ id: 5, parentId: 6 });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    expect(services.updateCategoryPage).toHaveBeenCalledExactlyOnceWith(TX, {
      blobStore: BLOB_STORE,
      storeId: 7,
      values: {
        coverAltEn: null,
        coverAltEs: "Anillo sello",
        id: 5,
        parentId: 6,
        seoDescriptionEn: null,
        seoDescriptionEs: "Anillos de la feria",
        seoTitleEn: "Rings",
        seoTitleEs: null,
      },
    });
    // A group changes the header, the pages' addresses and their texts.
    expect(services.invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(7);
    // The replaced cover's file goes once the write committed.
    expect(services.discardBlobs).toHaveBeenCalledExactlyOnceWith(db, [
      OLD_COVER,
    ]);
    expect(services.discardBlobs.mock.invocationCallOrder[0]).toBeGreaterThan(
      services.invalidateCatalogCache.mock.invocationCallOrder[0] ?? Infinity
    );
  });

  test("passes a new cover through to the service, and a refused one deletes no file", async () => {
    const { run } = setup();
    const cover = {
      height: 800,
      url: "https://store9.public.blob.vercel-storage.com/qa/cover/0f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e.webp",
      width: 2400,
    };
    services.updateCategoryPage.mockRejectedValueOnce(
      Object.assign(
        new Error("A cover image must be one uploaded to this store"),
        {
          code: "BAD_REQUEST",
        }
      )
    );

    await expect(
      run("updatePage", {
        cover,
        coverAltEn: "",
        coverAltEs: "",
        coverPhone: null,
        id: 5,
        parentId: null,
        seoDescriptionEn: "",
        seoDescriptionEs: "",
        seoTitleEn: "",
        seoTitleEs: "",
      })
    ).rejects.toMatchObject({
      message: "A cover image must be one uploaded to this store",
    });
    expect(services.updateCategoryPage).toHaveBeenCalledExactlyOnceWith(TX, {
      blobStore: BLOB_STORE,
      storeId: 7,
      values: expect.objectContaining({ cover, coverPhone: null }),
    });
    expect(services.discardBlobs).not.toHaveBeenCalled();
  });

  test("refuses a cover that is not an HTTPS address before any write", async () => {
    const { run } = setup();

    await expect(
      run("updatePage", {
        cover: { height: 800, url: "javascript-free:nope", width: 2400 },
        coverAltEn: "",
        coverAltEs: "",
        id: 5,
        parentId: null,
        seoDescriptionEn: "",
        seoDescriptionEs: "",
        seoTitleEn: "",
        seoTitleEs: "",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
    expect(services.withAdmin).not.toHaveBeenCalled();
  });

  test("reorders within the store, then drops its cached catalog", async () => {
    const { db, run } = setup();

    await expect(run("reorder", { ids: [3, 1, 2] })).resolves.toEqual({
      ids: [3, 1, 2],
    });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    expect(services.reorderCategories).toHaveBeenCalledExactlyOnceWith(TX, {
      ids: [3, 1, 2],
      storeId: 7,
    });
    // The header and the footer list the categories in this order.
    expect(services.invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(7);
  });

  test("deletes by id within the store, with where its articles move, then drops its cached catalog", async () => {
    const { db, run } = setup();

    await expect(run("delete", { id: "5", moveToId: 6 })).resolves.toEqual({
      id: 12,
      movedArticles: 3,
    });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    expect(services.deleteCategory).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 5,
      moveToId: 6,
      storeId: 7,
    });
    expect(services.invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(7);
    // Its cover's files go with it, once the deletion committed.
    expect(services.discardBlobs).toHaveBeenCalledExactlyOnceWith(db, [
      OLD_COVER,
    ]);
  });

  test.each([
    ["list", undefined, services.listStoreCategories],
    ["delete", { id: 5, moveToId: null }, services.deleteCategory],
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
      expect(services.invalidateCatalogCache).not.toHaveBeenCalled();
    }
  );

  test("a signed-out caller is UNAUTHORIZED, before the login is read", async () => {
    const { run } = setup({ signedIn: false });

    await expect(
      run("create", {
        nameEn: null,
        nameEs: "Collares",
      })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(services.findAdminStore).not.toHaveBeenCalled();
    expect(services.createCategory).not.toHaveBeenCalled();
  });

  test.each([
    ["create", { nameEn: null, nameEs: "  " }],
    ["reorder", { ids: [1, 1] }],
    ["delete", { id: 5, moveToId: "6" }],
    ["updatePage", { id: 5, parentId: "6" }],
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
