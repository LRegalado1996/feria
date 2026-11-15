import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { categoryRouter } from "./category";

// The router is input → store access → service, writes inside the access
// check. The queries are `src/server/services/category.test.ts`'s and the
// access rules `src/server/services/access.test.ts`'s.

// The handle `withStoreAccess` hands its write: distinct from the client, so
// a write that went through the outer client instead would be caught.
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
  findAccessibleStore: vi.fn(),
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
  withStoreAccess: vi.fn(
    async (
      _db: unknown,
      _scope: unknown,
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
}));

vi.mock("@/server/services/access", () => ({
  findAccessibleStore: services.findAccessibleStore,
  getUserRole: vi.fn(),
  withStoreAccess: services.withStoreAccess,
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

const STORE = { id: 7, slug: "lr-market" };
const ACCESS = { storeId: 7, userId: "test-user-id" };

/** A caller who may work on `lr-market` (or no store at all, or nobody). */
function setup({
  mayWork = true,
  signedIn = true,
}: { mayWork?: boolean; signedIn?: boolean } = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  services.findAccessibleStore.mockResolvedValue(mayWork ? STORE : null);
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
  };
  const run = async (name: keyof typeof procedures, input: unknown) =>
    await procedures[name](input);

  return { db: mockCtx.db, run };
}

describe("category router", () => {
  test("lists the resolved store's categories, outside any write", async () => {
    const { db, run } = setup();

    await expect(run("list", { storeSlug: "lr-market" })).resolves.toEqual([
      {
        id: 1,
        nameEn: "Necklaces",
        nameEs: "Collares",
        position: 0,
        productCount: 4,
        slug: "collares",
      },
    ]);

    expect(services.findAccessibleStore).toHaveBeenCalledExactlyOnceWith(db, {
      slug: "lr-market",
      userId: "test-user-id",
    });
    expect(services.listStoreCategories).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: 7,
    });
    expect(services.withStoreAccess).not.toHaveBeenCalled();
  });

  test("creates the category in the resolved store, a blank English name as none", async () => {
    const { db, run } = setup();

    await expect(
      run("create", {
        nameEn: "  ",
        nameEs: " Collares ",
        storeSlug: "lr-market",
      })
    ).resolves.toEqual({ id: 11, position: 2, slug: "collares" });

    expect(services.withStoreAccess).toHaveBeenCalledExactlyOnceWith(
      db,
      ACCESS,
      expect.any(Function)
    );
    expect(services.createCategory).toHaveBeenCalledExactlyOnceWith(TX, {
      storeId: 7,
      values: { nameEn: null, nameEs: "Collares" },
    });
  });

  test("renames by id within the resolved store", async () => {
    const { db, run } = setup();

    await expect(
      run("rename", {
        id: "5",
        nameEn: "Necklaces",
        nameEs: "Collares",
        storeSlug: "lr-market",
      })
    ).resolves.toEqual({ id: 13, slug: "collares" });

    expect(services.withStoreAccess).toHaveBeenCalledExactlyOnceWith(
      db,
      ACCESS,
      expect.any(Function)
    );
    expect(services.renameCategory).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 5,
      storeId: 7,
      values: { nameEn: "Necklaces", nameEs: "Collares" },
    });
  });

  test("reorders within the resolved store", async () => {
    const { db, run } = setup();

    await expect(
      run("reorder", { ids: [3, 1, 2], storeSlug: "lr-market" })
    ).resolves.toEqual({ ids: [3, 1, 2] });

    expect(services.withStoreAccess).toHaveBeenCalledExactlyOnceWith(
      db,
      ACCESS,
      expect.any(Function)
    );
    expect(services.reorderCategories).toHaveBeenCalledExactlyOnceWith(TX, {
      ids: [3, 1, 2],
      storeId: 7,
    });
  });

  test("deletes by id within the resolved store, with where its articles move", async () => {
    const { db, run } = setup();

    await expect(
      run("delete", { id: "5", moveToId: 6, storeSlug: "lr-market" })
    ).resolves.toEqual({ id: 12, movedArticles: 3 });

    expect(services.withStoreAccess).toHaveBeenCalledExactlyOnceWith(
      db,
      ACCESS,
      expect.any(Function)
    );
    expect(services.deleteCategory).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 5,
      moveToId: 6,
      storeId: 7,
    });
  });

  test.each([
    ["list", { storeSlug: "tienda-demo" }, services.listStoreCategories],
    [
      "delete",
      { id: 5, moveToId: null, storeSlug: "tienda-demo" },
      services.deleteCategory,
    ],
  ] as const)(
    "%s on a store the caller may not work on is NOT_FOUND, before the service",
    async (name, input, service) => {
      const { run } = setup({ mayWork: false });

      await expect(run(name, input)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Store not found",
      });
      expect(services.withStoreAccess).not.toHaveBeenCalled();
      expect(service).not.toHaveBeenCalled();
    }
  );

  test("a signed-out caller is UNAUTHORIZED, before the store is resolved", async () => {
    const { run } = setup({ signedIn: false });

    await expect(
      run("create", {
        nameEn: null,
        nameEs: "Collares",
        storeSlug: "lr-market",
      })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(services.findAccessibleStore).not.toHaveBeenCalled();
    expect(services.createCategory).not.toHaveBeenCalled();
  });

  test.each([
    ["create", { nameEn: null, nameEs: "  ", storeSlug: "lr-market" }],
    ["reorder", { ids: [1, 1], storeSlug: "lr-market" }],
    ["delete", { id: 5, moveToId: "6", storeSlug: "lr-market" }],
  ] as const)(
    "refuses invalid %s input before resolving the store",
    async (name, input) => {
      const { run } = setup();

      await expect(run(name, input)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Input validation failed",
      });
      expect(services.findAccessibleStore).not.toHaveBeenCalled();
    }
  );
});
