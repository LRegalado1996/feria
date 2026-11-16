import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { productRouter } from "./product";

// The router is input → store access → service, inside the write's access
// check. The queries are `src/server/services/catalog.test.ts`'s and the
// access rules `src/server/services/access.test.ts`'s.

// The handle `withStoreAccess` hands its write: distinct from the client, so
// a mutation that wrote through the outer client instead would be caught.
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
  findAccessibleStore: vi.fn(),
  publishProduct: vi.fn(async () => ({
    id: 13,
    slug: "cadena",
    status: "published",
  })),
  reorderProductImages: vi.fn(async () => ({ id: 14, imageIds: [3, 1, 2] })),
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
  withStoreAccess: vi.fn(
    async (
      _db: unknown,
      _scope: unknown,
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
      await call(productRouter.create, input as never, options),
    delete: async (input: unknown) =>
      await call(productRouter.delete, input as never, options),
    publish: async (input: unknown) =>
      await call(productRouter.publish, input as never, options),
    reorderImages: async (input: unknown) =>
      await call(productRouter.reorderImages, input as never, options),
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

const ACCESS = { storeId: 7, userId: "test-user-id" };

describe("product router", () => {
  test("creates the draft in the resolved store, inside the access check", async () => {
    const { db, run } = setup();

    await expect(
      run("create", { ...makeFields(), storeSlug: "lr-market" })
    ).resolves.toEqual({ id: 11, slug: "cadena", status: "draft" });

    expect(services.withStoreAccess).toHaveBeenCalledExactlyOnceWith(
      db,
      ACCESS,
      expect.any(Function)
    );
    expect(services.createProduct).toHaveBeenCalledExactlyOnceWith(TX, {
      storeId: 7,
      values: makeFields(),
    });
  });

  test("updates by id within the resolved store", async () => {
    const { run } = setup();

    await expect(
      run("update", { ...makeFields(), id: 5, storeSlug: "lr-market" })
    ).resolves.toEqual({ id: 17, slug: "cadena", status: "draft" });

    expect(services.updateProduct).toHaveBeenCalledExactlyOnceWith(TX, {
      storeId: 7,
      values: { ...makeFields(), id: 5 },
    });
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
    "%s acts on the article by id within the resolved store",
    async (name, service, answer) => {
      const { db, run } = setup();

      await expect(
        run(name, { id: 5, storeSlug: "lr-market" })
      ).resolves.toEqual(answer);

      expect(services.withStoreAccess).toHaveBeenCalledExactlyOnceWith(
        db,
        ACCESS,
        expect.any(Function)
      );
      expect(service).toHaveBeenCalledExactlyOnceWith(TX, {
        id: 5,
        storeId: 7,
      });
    }
  );

  test("sets availability within the resolved store", async () => {
    const { run } = setup();

    await expect(
      run("setAvailability", {
        id: 5,
        isAvailable: false,
        storeSlug: "lr-market",
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
  });

  test("reorders images within the resolved store", async () => {
    const { run } = setup();

    await expect(
      run("reorderImages", {
        id: 5,
        imageIds: [3, 1, 2],
        storeSlug: "lr-market",
      })
    ).resolves.toEqual({ id: 14, imageIds: [3, 1, 2] });

    expect(services.reorderProductImages).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 5,
      imageIds: [3, 1, 2],
      storeId: 7,
    });
  });

  test("a store the caller may not work on is NOT_FOUND, before any write", async () => {
    const { run } = setup({ mayWork: false });

    await expect(
      run("publish", { id: 5, storeSlug: "tienda-demo" })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
    expect(services.withStoreAccess).not.toHaveBeenCalled();
    expect(services.publishProduct).not.toHaveBeenCalled();
  });

  test("a signed-out caller is UNAUTHORIZED, before the store is resolved", async () => {
    const { run } = setup({ signedIn: false });

    await expect(
      run("delete", { id: 5, storeSlug: "lr-market" })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(services.findAccessibleStore).not.toHaveBeenCalled();
  });

  test("refuses an article without its Spanish title before resolving the store", async () => {
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
        storeSlug: "lr-market",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
    expect(services.findAccessibleStore).not.toHaveBeenCalled();
  });
});
