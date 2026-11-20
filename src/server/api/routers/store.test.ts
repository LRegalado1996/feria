import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { store } from "@/server/db/schema";
import {
  createMockContext,
  createMockDatabase,
  createUnauthenticatedMockContext,
} from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { storeRouter } from "./store";

// The router is input → auth → service → cache. These tests cover that
// wiring; the queries are `src/server/services/store.test.ts`'s and the
// rules of each field `src/lib/schemas/store/store.test.ts`'s.

const { invalidateCatalogCache, invalidateStoreCache } = vi.hoisted(() => ({
  invalidateCatalogCache: vi.fn<(storeId: number) => void>(),
  invalidateStoreCache: vi.fn<() => void>(),
}));

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

vi.mock("@/server/better-auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => null),
    },
  },
}));

// Next's tag cache only exists inside a Next request.
vi.mock("@/server/cache/store", () => ({ invalidateStoreCache }));
vi.mock("@/server/cache/catalog", () => ({ invalidateCatalogCache }));

const INVALID_INPUT = {
  code: "BAD_REQUEST",
  message: "Input validation failed",
};

const SIGNED_OUT = { code: "UNAUTHORIZED", message: "Unauthorized" };

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    instagramUrl: null,
    name: "Sample Store",
    tiktokUrl: null,
    translations: [],
    whatsappNumber: null,
    ...overrides,
  };
}

/** The store's row as Postgres hands it back, with the currency it keeps. */
function makeRow(overrides: Record<string, unknown> = {}) {
  const { translations: _translations, ...columns } = makeInput(overrides);

  return { ...columns, currencyCode: "UYU", id: 7 };
}

/**
 * A caller, signed out or signed in, and what the database answers: whether
 * the login is still there (read by `adminProcedure`, then again under a
 * share lock inside the write) and whether the store's row is.
 */
function setup({
  isLogin = true,
  signedIn = true,
  storeExists = true,
}: { isLogin?: boolean; signedIn?: boolean; storeExists?: boolean } = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  mockCtx.db.query.user.findFirst.mockResolvedValue({ id: "test-user-id" });
  mockCtx.db.$["select.limit"].mockResolvedValue([{ id: 7 }]);
  // `FOR SHARE` reads the login inside the write; `FOR UPDATE` the store.
  mockCtx.db.$["select.for"].mockImplementation(async (strength: unknown) => {
    if (strength === "share") {
      return isLogin ? [{ id: "test-user-id" }] : [];
    }

    return storeExists ? [{ id: 7 }] : [];
  });
  const options = { context: mockCtx as never };

  return {
    db: mockCtx.db,
    get: async () => await call(storeRouter.get, undefined, options),
    update: async (input: unknown) =>
      await call(storeRouter.update, input as never, options),
  };
}

describe("store router", () => {
  test("reads and edits the one store, and has nothing that creates another", () => {
    expect(Object.keys(storeRouter)).toEqual(["get", "update"]);
  });
});

describe("store.get", () => {
  test("serves a signed-out visitor the store with its texts", async () => {
    const { db, get } = setup({ signedIn: false });
    const found = { ...makeRow(), translations: [] };
    db.query.store.findFirst.mockResolvedValue(found);

    await expect(get()).resolves.toEqual(found);
    expect(db.query.store.findFirst).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        with: {
          translations: {
            columns: { description: true, locale: true, tagline: true },
          },
        },
      })
    );
  });

  test("answers NOT_FOUND before the store's row exists", async () => {
    const { get } = setup({ signedIn: false });

    await expect(get()).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
  });
});

describe("store.update", () => {
  test("replaces the store's details on its own row, then drops the cached store and its articles' pages", async () => {
    const { db, update } = setup();
    db.$["update.returning"].mockResolvedValue([makeRow({ name: "Renamed" })]);

    await expect(update(makeInput({ name: " Renamed " }))).resolves.toEqual({
      ...makeRow({ name: "Renamed" }),
      translations: [],
    });

    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      instagramUrl: null,
      name: "Renamed",
      tiktokUrl: null,
      whatsappNumber: null,
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      sql: '"store"."id" = $1',
      params: [7],
    });
    expect(invalidateStoreCache).toHaveBeenCalledExactlyOnceWith();
    // The catalog's cover reads its description out of the store's texts.
    expect(invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(7);
  });

  test("never writes the currency, a color, an address or a default mark, even when a client sends one", async () => {
    const { db, update } = setup();
    db.$["update.returning"].mockResolvedValue([makeRow()]);

    await update(
      makeInput({
        colorAccent: "#ff0000",
        currencyCode: "USD",
        isDefault: true,
        logoUrl: "https://example.com/logo.png",
        slug: "another-address",
      })
    );

    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      instagramUrl: null,
      name: "Sample Store",
      tiktokUrl: null,
      whatsappNumber: null,
    });
  });

  test("re-checks the login under a share lock inside the write's transaction, before locking and writing the store", async () => {
    const { db, update } = setup();
    // The transaction's own handle: the locks and the write must all use it.
    const tx = createMockDatabase();
    db.$.transaction.mockImplementation(
      async (callback: unknown) =>
        await (callback as (handle: unknown) => Promise<unknown>)(tx)
    );
    tx.$["select.for"].mockImplementation(async (strength: unknown) =>
      strength === "share" ? [{ id: "test-user-id" }] : [{ id: 7 }]
    );
    tx.$["update.returning"].mockResolvedValue([makeRow()]);

    await update(makeInput());

    expect(tx.$["select.for"].mock.calls).toEqual([["share"], ["update"]]);
    expect(tx.$.update).toHaveBeenCalledExactlyOnceWith(store);
    expect(tx.$["select.for"].mock.invocationCallOrder[1]).toBeLessThan(
      tx.$.update.mock.invocationCallOrder[0] ?? 0
    );
    expect(db.$["select.for"]).not.toHaveBeenCalled();
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("refuses a login removed after the procedure's check, writing nothing", async () => {
    const { db, update } = setup({ isLogin: false });

    await expect(update(makeInput())).rejects.toMatchObject(SIGNED_OUT);
    expect(db.$.update).not.toHaveBeenCalled();
    expect(invalidateStoreCache).not.toHaveBeenCalled();
    expect(invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test("answers NOT_FOUND when the store's row is gone, leaving the caches alone", async () => {
    const { db, update } = setup({ storeExists: false });

    await expect(update(makeInput())).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
    expect(db.$.update).not.toHaveBeenCalled();
    expect(invalidateStoreCache).not.toHaveBeenCalled();
    expect(invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test.each([
    ["a name of spaces", { name: "   " }],
    ["a WhatsApp number in local form", { whatsappNumber: "099 123 456" }],
    ["a link that is not https", { instagramUrl: "http://instagram.com/x" }],
  ])(
    "refuses %s before reading the login or touching the store",
    async (_case, overrides) => {
      const { db, update } = setup();

      await expect(update(makeInput(overrides))).rejects.toMatchObject(
        INVALID_INPUT
      );
      expect(db.query.user.findFirst).not.toHaveBeenCalled();
      expect(db.$.update).not.toHaveBeenCalled();
    }
  );

  test("refuses a signed-out caller before touching the database", async () => {
    const { db, update } = setup({ signedIn: false });

    await expect(update(makeInput())).rejects.toMatchObject(SIGNED_OUT);
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
    expect(db.$.update).not.toHaveBeenCalled();
    expect(invalidateStoreCache).not.toHaveBeenCalled();
    expect(invalidateCatalogCache).not.toHaveBeenCalled();
  });
});
