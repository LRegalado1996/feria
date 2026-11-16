import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { productRouter } from "./product";

// The router is input → the admin's login and store → service, inside the
// login's re-check. The queries are `src/server/services/catalog.test.ts`'s
// and the access rules `src/server/services/access.test.ts`'s.

// The handle `withAdmin` hands its write: distinct from the client, so a
// mutation that wrote through the outer client instead would be caught.
const { TX } = vi.hoisted(() => ({
  TX: { handle: "the write's transaction" },
}));

const services = vi.hoisted(() => ({
  createProduct: vi.fn(async () => ({
    id: 11,
    slug: "cadena",
    status: "draft",
  })),
  deleteProduct: vi.fn(async () => ({ id: 12 })),
  findAdminStore: vi.fn(),
  invalidateCatalogCache: vi.fn<(storeId: number) => void>(),
  publishProduct: vi.fn(async () => ({
    id: 13,
    slug: "cadena",
    status: "published",
  })),
  reorderProductImages: vi.fn(async () => ({ id: 14, imageIds: [3, 1, 2] })),
  setProductAttributeValues: vi.fn(async () => ({
    id: 18,
    valueIds: [21, 22],
  })),
  setProductAvailability: vi.fn(async () => ({ id: 15, isAvailable: false })),
  unpublishProduct: vi.fn(async () => ({
    id: 16,
    slug: "cadena",
    status: "draft",
  })),
  updateProduct: vi.fn(async () => ({
    id: 17,
    slug: "cadena",
    status: "draft",
  })),
  withAdmin: vi.fn(
    async (
      _db: unknown,
      _userId: unknown,
      write: (handle: unknown) => Promise<unknown>
    ) => await write(TX)
  ),
}));

vi.mock("@/server/services/catalog", () => ({
  createProduct: services.createProduct,
  deleteProduct: services.deleteProduct,
  publishProduct: services.publishProduct,
  reorderProductImages: services.reorderProductImages,
  setProductAvailability: services.setProductAvailability,
  unpublishProduct: services.unpublishProduct,
  updateProduct: services.updateProduct,
}));

vi.mock("@/server/services/attribute", () => ({
  setProductAttributeValues: services.setProductAttributeValues,
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

const UNAUTHORIZED = { code: "UNAUTHORIZED", message: "Unauthorized" };

function makeFields(overrides: Record<string, unknown> = {}) {
  return {
    categoryId: 3,
    isAvailable: true,
    priceAmount: 129_000,
    translations: [
      {
        description: "",
        locale: "es",
        seoDescription: null,
        seoTitle: null,
        title: "Cadena",
      },
    ],
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
      await call(productRouter.create, input as never, options),
    delete: async (input: unknown) =>
      await call(productRouter.delete, input as never, options),
    publish: async (input: unknown) =>
      await call(productRouter.publish, input as never, options),
    reorderImages: async (input: unknown) =>
      await call(productRouter.reorderImages, input as never, options),
    setAttributeValues: async (input: unknown) =>
      await call(productRouter.setAttributeValues, input as never, options),
    setAvailability: async (input: unknown) =>
      await call(productRouter.setAvailability, input as never, options),
    unpublish: async (input: unknown) =>
      await call(productRouter.unpublish, input as never, options),
    update: async (input: unknown) =>
      await call(productRouter.update, input as never, options),
  };
  const run = async (name: keyof typeof procedures, input: unknown) =>
    await procedures[name](input);

  return { db: mockCtx.db, run };
}

const USER_ID = "test-user-id";

describe("product router", () => {
  test("creates the draft in the store, inside the access check", async () => {
    const { db, run } = setup();

    await expect(run("create", { ...makeFields() })).resolves.toEqual({
      id: 11,
      slug: "cadena",
      status: "draft",
    });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    expect(services.createProduct).toHaveBeenCalledExactlyOnceWith(TX, {
      storeId: 7,
      values: makeFields(),
    });
    // A new article is a draft: no shopper's page shows it yet.
    expect(services.invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test("updates by id within the store, then drops its cached catalog", async () => {
    const { run } = setup();

    await expect(run("update", { ...makeFields(), id: 5 })).resolves.toEqual({
      id: 17,
      slug: "cadena",
      status: "draft",
    });

    expect(services.updateProduct).toHaveBeenCalledExactlyOnceWith(TX, {
      storeId: 7,
      values: { ...makeFields(), id: 5 },
    });
    expect(services.invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(7);
  });

  test.each([
    [
      "publish",
      services.publishProduct,
      { id: 13, slug: "cadena", status: "published" },
    ],
    [
      "unpublish",
      services.unpublishProduct,
      { id: 16, slug: "cadena", status: "draft" },
    ],
    ["delete", services.deleteProduct, { id: 12 }],
  ] as const)(
    "%s acts on the article by id within the store, then drops its cached catalog",
    async (name, service, answer) => {
      const { db, run } = setup();

      await expect(run(name, { id: 5 })).resolves.toEqual(answer);

      expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
        db,
        USER_ID,
        expect.any(Function)
      );
      expect(service).toHaveBeenCalledExactlyOnceWith(TX, {
        id: 5,
        storeId: 7,
      });
      expect(services.invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(
        7
      );
    }
  );

  test("sets availability within the store, then drops its cached catalog", async () => {
    const { run } = setup();

    await expect(
      run("setAvailability", {
        id: 5,
        isAvailable: false,
      })
    ).resolves.toEqual({ id: 15, isAvailable: false });

    expect(services.setProductAvailability).toHaveBeenCalledExactlyOnceWith(
      TX,
      {
        id: 5,
        isAvailable: false,
        storeId: 7,
      }
    );
    expect(services.invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(7);
  });

  test("reorders images within the store, then drops its cached catalog", async () => {
    const { run } = setup();

    await expect(
      run("reorderImages", {
        id: 5,
        imageIds: [3, 1, 2],
      })
    ).resolves.toEqual({ id: 14, imageIds: [3, 1, 2] });

    expect(services.reorderProductImages).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 5,
      imageIds: [3, 1, 2],
      storeId: 7,
    });
    expect(services.invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(7);
  });

  test("replaces the article's filter values within the store", async () => {
    const { db, run } = setup();

    await expect(
      run("setAttributeValues", {
        id: "5",
        valueIds: [21, 22],
      })
    ).resolves.toEqual({ id: 18, valueIds: [21, 22] });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    // The path's id is the article's; the store is the resolved one.
    expect(services.setProductAttributeValues).toHaveBeenCalledExactlyOnceWith(
      TX,
      { productId: 5, storeId: 7, valueIds: [21, 22] }
    );
    // The article page shows no filter values, so its cache stays.
    expect(services.invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test("takes every value off with an empty list", async () => {
    const { run } = setup();

    await run("setAttributeValues", {
      id: 5,
      valueIds: [],
    });

    expect(services.setProductAttributeValues).toHaveBeenCalledExactlyOnceWith(
      TX,
      { productId: 5, storeId: 7, valueIds: [] }
    );
  });

  test.each([
    ["repeats a value", [21, 21]],
    ["sends an id as text", ["21"]],
    [
      "carries more than 50",
      Array.from({ length: 51 }, (_, index) => index + 1),
    ],
  ])(
    "refuses filter values when the list %s, before reading the login",
    async (_case, valueIds) => {
      const { run } = setup();

      await expect(
        run("setAttributeValues", { id: 5, valueIds })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Input validation failed",
      });
      expect(services.findAdminStore).not.toHaveBeenCalled();
      expect(services.setProductAttributeValues).not.toHaveBeenCalled();
    }
  );

  test("filter values by a login the database no longer has are UNAUTHORIZED, before the service", async () => {
    const { run } = setup({ isLogin: false });

    await expect(
      run("setAttributeValues", {
        id: 5,
        valueIds: [21],
      })
    ).rejects.toMatchObject(UNAUTHORIZED);
    expect(services.withAdmin).not.toHaveBeenCalled();
    expect(services.setProductAttributeValues).not.toHaveBeenCalled();
  });

  test("a login the database no longer has is UNAUTHORIZED, before any write", async () => {
    const { run } = setup({ isLogin: false });

    await expect(run("publish", { id: 5 })).rejects.toMatchObject(UNAUTHORIZED);
    expect(services.withAdmin).not.toHaveBeenCalled();
    expect(services.publishProduct).not.toHaveBeenCalled();
    expect(services.invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test("a signed-out caller is UNAUTHORIZED, before the login is read", async () => {
    const { run } = setup({ signedIn: false });

    await expect(run("delete", { id: 5 })).rejects.toMatchObject(UNAUTHORIZED);
    expect(services.findAdminStore).not.toHaveBeenCalled();
  });

  test("refuses an article without its Spanish title before reading the login", async () => {
    const { run } = setup();

    await expect(
      run("create", {
        ...makeFields({
          translations: [
            {
              description: "",
              locale: "en",
              seoDescription: null,
              seoTitle: null,
              title: "Chain",
            },
          ],
        }),
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
    expect(services.findAdminStore).not.toHaveBeenCalled();
  });
});
