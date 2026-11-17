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
const { TX } = vi.hoisted(() => ({
  TX: { handle: "the write's transaction" },
}));

const services = vi.hoisted(() => ({
  createCategory: vi.fn(async () => ({
    id: 11,
    position: 2,
    slug: "collares",
  })),
  deleteCategory: vi.fn(async () => ({ id: 12, movedArticles: 3 })),
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
  updateCategoryPage: vi.fn(async () => ({ id: 5, parentId: 6 })),
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

/** A category's page as the admin's form sends it: every text valid. */
function makePageInput(overrides: Record<string, unknown> = {}) {
  return {
    coverAltEn: "",
    coverAltEs: " Anillo sello ",
    id: "5",
    parentId: 6,
    seoDescriptionEn: "  ",
    seoDescriptionEs: "Anillos de la feria",
    seoTitleEn: "Rings",
    seoTitleEs: "",
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

    await expect(run("updatePage", makePageInput())).resolves.toEqual({
      id: 5,
      parentId: 6,
    });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    expect(services.updateCategoryPage).toHaveBeenCalledExactlyOnceWith(TX, {
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
    // Valid but for the group sent as text, so only its rule refuses it.
    ["updatePage", makePageInput({ parentId: "6" })],
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
