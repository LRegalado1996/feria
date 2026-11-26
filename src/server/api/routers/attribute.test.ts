import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { attributeRouter } from "./attribute";

// The router is input → the admin's login and store → service, writes
// inside the login's re-check. The queries are
// `src/server/services/attribute.test.ts`'s and the access rules
// `src/server/services/access.test.ts`'s.

// The handle `withAdmin` hands its write: distinct from the client, so a
// write that went through the outer client instead would be caught.
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
  findAdminStore: vi.fn(),
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
  withAdmin: vi.fn(
    async (
      _db: unknown,
      _userId: unknown,
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
  findAdminStore: services.findAdminStore,
  withAdmin: services.withAdmin,
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
  test("lists the store's filters, outside any write", async () => {
    const { db, run } = setup();

    await expect(run("list", undefined)).resolves.toEqual([
      {
        id: 1,
        nameEn: "Color",
        nameEs: "Color",
        position: 0,
        slug: "color",
        values: [],
      },
    ]);

    expect(services.findAdminStore).toHaveBeenCalledExactlyOnceWith(db, {
      sessionId: "test-session-id",
      userId: USER_ID,
    });
    expect(services.listStoreAttributes).toHaveBeenCalledExactlyOnceWith(db, {
      storeId: 7,
    });
    expect(services.withAdmin).not.toHaveBeenCalled();
  });

  test("creates the filter in the store, a blank English name as none", async () => {
    const { db, run } = setup();

    await expect(
      run("create", { nameEn: "  ", nameEs: " Color " })
    ).resolves.toEqual({ id: 11, position: 2, slug: "color" });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    expect(services.createAttribute).toHaveBeenCalledExactlyOnceWith(TX, {
      storeId: 7,
      values: { nameEn: null, nameEs: "Color" },
    });
  });

  test("renames by id within the store", async () => {
    const { run } = setup();

    await expect(
      run("rename", {
        id: "5",
        nameEn: "Colour",
        nameEs: "Color",
      })
    ).resolves.toEqual({ id: 13, slug: "color" });

    expect(services.renameAttribute).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 5,
      storeId: 7,
      values: { nameEn: "Colour", nameEs: "Color" },
    });
  });

  test("reorders the filters within the store", async () => {
    const { run } = setup();

    await expect(run("reorder", { ids: [3, 1, 2] })).resolves.toEqual({
      ids: [3, 1, 2],
    });

    expect(services.reorderAttributes).toHaveBeenCalledExactlyOnceWith(TX, {
      ids: [3, 1, 2],
      storeId: 7,
    });
  });

  test("deletes a filter by id within the store", async () => {
    const { run } = setup();

    await expect(run("delete", { id: "5" })).resolves.toEqual({ id: 12 });

    expect(services.deleteAttribute).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 5,
      storeId: 7,
    });
  });

  test("adds a value to a filter of the store, its swatch in lowercase", async () => {
    const { db, run } = setup();

    await expect(
      run("createValue", {
        attributeId: 5,
        nameEn: "Gold",
        nameEs: "Dorado",
        swatchColor: " #D4AF37 ",
      })
    ).resolves.toEqual({ id: 21, position: 0, slug: "dorado" });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    expect(services.createAttributeValue).toHaveBeenCalledExactlyOnceWith(TX, {
      attributeId: 5,
      storeId: 7,
      swatchColor: "#d4af37",
      values: { nameEn: "Gold", nameEs: "Dorado" },
    });
  });

  test("updates a value by id within the store, without a swatch", async () => {
    const { run } = setup();

    await expect(
      run("updateValue", {
        id: "24",
        nameEn: "",
        nameEs: "Plateado",
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

  test("reorders a filter's values within the store", async () => {
    const { run } = setup();

    await expect(
      run("reorderValues", {
        attributeId: 5,
        ids: [23, 21],
      })
    ).resolves.toEqual({ ids: [23, 21] });

    expect(services.reorderAttributeValues).toHaveBeenCalledExactlyOnceWith(
      TX,
      { attributeId: 5, ids: [23, 21], storeId: 7 }
    );
  });

  test("deletes a value by id, answering how many articles lost it", async () => {
    const { run } = setup();

    await expect(run("deleteValue", { id: "22" })).resolves.toEqual({
      id: 22,
      removedFromArticles: 3,
    });

    expect(services.deleteAttributeValue).toHaveBeenCalledExactlyOnceWith(TX, {
      id: 22,
      storeId: 7,
    });
  });

  test.each([
    ["list", undefined, services.listStoreAttributes],
    ["delete", { id: 5 }, services.deleteAttribute],
    [
      "createValue",
      {
        attributeId: 5,
        nameEn: null,
        nameEs: "Dorado",
        swatchColor: null,
      },
      services.createAttributeValue,
    ],
    ["deleteValue", { id: 22 }, services.deleteAttributeValue],
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
    }
  );

  test("a signed-out caller is UNAUTHORIZED, before the login is read", async () => {
    const { run } = setup({ signedIn: false });

    await expect(
      run("create", { nameEn: null, nameEs: "Color" })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(services.findAdminStore).not.toHaveBeenCalled();
    expect(services.createAttribute).not.toHaveBeenCalled();
  });

  test.each([
    ["create", { nameEn: null, nameEs: "  " }],
    ["reorder", { ids: [1, 1] }],
    [
      "createValue",
      {
        attributeId: 5,
        nameEn: null,
        nameEs: "Dorado",
        swatchColor: "gold",
      },
    ],
    [
      "updateValue",
      {
        id: 24,
        nameEn: null,
        nameEs: "Dorado",
        swatchColor: "#d4af3",
      },
    ],
    ["reorderValues", { attributeId: "5", ids: [21] }],
    ["deleteValue", { id: "" }],
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
