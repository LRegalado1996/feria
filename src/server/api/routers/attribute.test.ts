import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { attributeRouter } from "./attribute";

// The router is input → store access → service, writes inside the access
// check. The queries are `src/server/services/attribute.test.ts`'s and the
// access rules `src/server/services/access.test.ts`'s.

// The handle `withStoreAccess` hands its write: distinct from the client, so
// a write that went through the outer client instead would be caught.
const { TX } = vi.hoisted(() => ({
  TX: { handle: "the write's transaction" },
}));

const services = vi.hoisted(() => ({
  createAttribute: vi.fn(async () => ({ id: 11, position: 2, slug: "color" })),
  createAttributeValue: vi.fn(async () => ({
    id: 21,
    position: 0,
    slug: "dorado",
  })),
  deleteAttribute: vi.fn(async () => ({ id: 12 })),
  deleteAttributeValue: vi.fn(async () => ({ id: 22, removedFromArticles: 3 })),
  findAccessibleStore: vi.fn(),
  listStoreAttributes: vi.fn(async () => [
    {
      id: 1,
      nameEn: "Color",
      nameEs: "Color",
      position: 0,
      slug: "color",
      values: [],
    },
  ]),
  renameAttribute: vi.fn(async () => ({ id: 13, slug: "color" })),
  reorderAttributeValues: vi.fn(async () => ({ ids: [23, 21] })),
  reorderAttributes: vi.fn(async () => ({ ids: [3, 1, 2] })),
  updateAttributeValue: vi.fn(async () => ({ id: 24 })),
  withStoreAccess: vi.fn(
    async (
      _db: unknown,
      _scope: unknown,
      write: (handle: unknown) => Promise<unknown>
    ) => await write(TX)
  ),
}));

vi.mock("@/server/services/attribute", () => ({
  createAttribute: services.createAttribute,
  createAttributeValue: services.createAttributeValue,
  deleteAttribute: services.deleteAttribute,
  deleteAttributeValue: services.deleteAttributeValue,
  listStoreAttributes: services.listStoreAttributes,
  renameAttribute: services.renameAttribute,
  reorderAttributeValues: services.reorderAttributeValues,
  reorderAttributes: services.reorderAttributes,
  updateAttributeValue: services.updateAttributeValue,
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
      await call(attributeRouter.create, input as never, options),
    createValue: async (input: unknown) =>
      await call(attributeRouter.createValue, input as never, options),
    delete: async (input: unknown) =>
      await call(attributeRouter.delete, input as never, options),
    deleteValue: async (input: unknown) =>
      await call(attributeRouter.deleteValue, input as never, options),
    list: async (input: unknown) =>
      await call(attributeRouter.list, input as never, options),
    rename: async (input: unknown) =>
      await call(attributeRouter.rename, input as never, options),
    reorder: async (input: unknown) =>
      await call(attributeRouter.reorder, input as never, options),
    reorderValues: async (input: unknown) =>
      await call(attributeRouter.reorderValues, input as never, options),
    updateValue: async (input: unknown) =>
      await call(attributeRouter.updateValue, input as never, options),
  };
  const run = async (name: keyof typeof procedures, input: unknown) =>
    await procedures[name](input);

  return { db: mockCtx.db, run };
}

describe("attribute router", () => {
  test("lists the resolved store's filters, outside any write", async () => {
    const { db, run } = setup();

    await expect(run("list", { storeSlug: "lr-market" })).resolves.toEqual([
      {
        id: 1,
        nameEn: "Color",
        nameEs: "Color",
        position: 0,
        slug: "color",
        values: [],
      },
    ]);

    expect(services.findAccessibleStore).toHaveBeenCalledExactlyOnceWith(db, {
      slug: "lr-market",
      userId: "test-user-id",
    });
    expect(services.listStoreAttributes).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: 7,
    });
    expect(services.withStoreAccess).not.toHaveBeenCalled();
  });

  test("creates the filter in the resolved store, a blank English name as none", async () => {
    const { db, run } = setup();

    await expect(
      run("create", { nameEn: "  ", nameEs: " Color ", storeSlug: "lr-market" })
    ).resolves.toEqual({ id: 11, position: 2, slug: "color" });

    expect(services.withStoreAccess).toHaveBeenCalledExactlyOnceWith(
      db,
      ACCESS,
      expect.any(Function)
    );
    expect(services.createAttribute).toHaveBeenCalledExactlyOnceWith(TX, {
      storeId: 7,
      values: { nameEn: null, nameEs: "Color" },
    });
  });

  test("renames by id within the resolved store", async () => {
    const { run } = setup();

    await expect(
      run("rename", {
        id: "5",
        nameEn: "Colour",
        nameEs: "Color",
        storeSlug: "lr-market",
      })
    ).resolves.toEqual({ id: 13, slug: "color" });

    expect(services.renameAttribute).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 5,
      storeId: 7,
      values: { nameEn: "Colour", nameEs: "Color" },
    });
  });

  test("reorders the filters within the resolved store", async () => {
    const { run } = setup();

    await expect(
      run("reorder", { ids: [3, 1, 2], storeSlug: "lr-market" })
    ).resolves.toEqual({ ids: [3, 1, 2] });

    expect(services.reorderAttributes).toHaveBeenCalledExactlyOnceWith(TX, {
      ids: [3, 1, 2],
      storeId: 7,
    });
  });

  test("deletes a filter by id within the resolved store", async () => {
    const { run } = setup();

    await expect(
      run("delete", { id: "5", storeSlug: "lr-market" })
    ).resolves.toEqual({ id: 12 });

    expect(services.deleteAttribute).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 5,
      storeId: 7,
    });
  });

  test("adds a value to a filter of the resolved store, its swatch in lowercase", async () => {
    const { db, run } = setup();

    await expect(
      run("createValue", {
        attributeId: 5,
        nameEn: "Gold",
        nameEs: "Dorado",
        storeSlug: "lr-market",
        swatchColor: " #D4AF37 ",
      })
    ).resolves.toEqual({ id: 21, position: 0, slug: "dorado" });

    expect(services.withStoreAccess).toHaveBeenCalledExactlyOnceWith(
      db,
      ACCESS,
      expect.any(Function)
    );
    expect(services.createAttributeValue).toHaveBeenCalledExactlyOnceWith(TX, {
      attributeId: 5,
      storeId: 7,
      swatchColor: "#d4af37",
      values: { nameEn: "Gold", nameEs: "Dorado" },
    });
  });

  test("updates a value by id within the resolved store, without a swatch", async () => {
    const { run } = setup();

    await expect(
      run("updateValue", {
        id: "24",
        nameEn: "",
        nameEs: "Plateado",
        storeSlug: "lr-market",
        swatchColor: null,
      })
    ).resolves.toEqual({ id: 24 });

    expect(services.updateAttributeValue).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 24,
      storeId: 7,
      swatchColor: null,
      values: { nameEn: null, nameEs: "Plateado" },
    });
  });

  test("reorders a filter's values within the resolved store", async () => {
    const { run } = setup();

    await expect(
      run("reorderValues", {
        attributeId: 5,
        ids: [23, 21],
        storeSlug: "lr-market",
      })
    ).resolves.toEqual({ ids: [23, 21] });

    expect(services.reorderAttributeValues).toHaveBeenCalledExactlyOnceWith(
      TX,
      { attributeId: 5, ids: [23, 21], storeId: 7 }
    );
  });

  test("deletes a value by id, answering how many articles lost it", async () => {
    const { run } = setup();

    await expect(
      run("deleteValue", { id: "22", storeSlug: "lr-market" })
    ).resolves.toEqual({ id: 22, removedFromArticles: 3 });

    expect(services.deleteAttributeValue).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 22,
      storeId: 7,
    });
  });

  test.each([
    ["list", { storeSlug: "tienda-demo" }, services.listStoreAttributes],
    ["delete", { id: 5, storeSlug: "tienda-demo" }, services.deleteAttribute],
    [
      "createValue",
      {
        attributeId: 5,
        nameEn: null,
        nameEs: "Dorado",
        storeSlug: "tienda-demo",
        swatchColor: null,
      },
      services.createAttributeValue,
    ],
    [
      "deleteValue",
      { id: 22, storeSlug: "tienda-demo" },
      services.deleteAttributeValue,
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
      run("create", { nameEn: null, nameEs: "Color", storeSlug: "lr-market" })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(services.findAccessibleStore).not.toHaveBeenCalled();
    expect(services.createAttribute).not.toHaveBeenCalled();
  });

  test.each([
    ["create", { nameEn: null, nameEs: "  ", storeSlug: "lr-market" }],
    ["reorder", { ids: [1, 1], storeSlug: "lr-market" }],
    [
      "createValue",
      {
        attributeId: 5,
        nameEn: null,
        nameEs: "Dorado",
        storeSlug: "lr-market",
        swatchColor: "gold",
      },
    ],
    [
      "updateValue",
      {
        id: 24,
        nameEn: null,
        nameEs: "Dorado",
        storeSlug: "lr-market",
        swatchColor: "#d4af3",
      },
    ],
    ["reorderValues", { attributeId: "5", ids: [21], storeSlug: "lr-market" }],
    ["deleteValue", { id: "", storeSlug: "lr-market" }],
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
