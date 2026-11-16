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
  invalidateStoreCache: vi.fn<(store: { id: number; slug: string }) => void>(),
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

const STORED_AT = new Date("2026-11-13T12:00:00.000Z");

const INVALID_INPUT = {
  code: "BAD_REQUEST",
  message: "Input validation failed",
};

const SIGNED_OUT = { code: "UNAUTHORIZED", message: "Unauthorized" };

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    colorAccent: "#c8f31d",
    colorBackground: "#f2f3f0",
    colorContrast: "#111312",
    colorForeground: "#111312",
    colorSurface: "#ffffff",
    currencyCode: "UYU",
    instagramUrl: null,
    isActive: true,
    isDefault: false,
    logoUrl: null,
    name: "Sample Store",
    slug: "sample-store",
    tiktokUrl: null,
    translations: [],
    whatsappNumber: null,
    ...overrides,
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  const { translations: _translations, ...columns } = makeInput(overrides);

  return { ...columns, createdAt: STORED_AT, id: 7, updatedAt: STORED_AT };
}

/**
 * A caller: signed out, or signed in with the role the database holds for
 * them now (`superadminProcedure` reads it there, not off the session).
 */
function setup({
  role = null,
}: { role?: "member" | "superadmin" | null } = {}) {
  const { mockCtx } =
    role === null ? createUnauthenticatedMockContext() : createMockContext();
  mockCtx.db.query.user.findFirst.mockImplementation(async () =>
    role === null ? undefined : { role }
  );
  // The role re-read under a lock inside the write's transaction.
  mockCtx.db.$["select.for"].mockImplementation(async () =>
    role === "superadmin" ? [{ id: "test-user-id" }] : []
  );
  const options = { context: mockCtx as never };

  return {
    db: mockCtx.db,
    create: async (input: unknown) =>
      await call(storeRouter.create, input as never, options),
    getBySlug: async (input: unknown) =>
      await call(storeRouter.getBySlug, input as never, options),
    update: async (input: unknown) =>
      await call(storeRouter.update, input as never, options),
  };
}

describe("store.getBySlug", () => {
  test("serves a signed-out visitor the active store at that address", async () => {
    const { db, getBySlug } = setup();
    const found = { id: 7, name: "Sample Store", slug: "sample-store" };
    db.query.store.findFirst.mockResolvedValue(found);

    await expect(getBySlug({ slug: "sample-store" })).resolves.toEqual(found);

    const query = db.query.store.findFirst.mock.calls[0]?.[0] as {
      where: unknown;
    };
    expect(renderQuery(query.where)).toEqual({
      sql: '("store"."slug" = $1 and "store"."isActive" = $2)',
      params: ["sample-store", true],
    });
  });

  test("answers NOT_FOUND when no active store has that address", async () => {
    const { getBySlug } = setup();

    await expect(getBySlug({ slug: "sample-store" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
  });

  test.each([
    ["reserved", "admin"],
    ["malformed", "Sample Store"],
    ["missing", undefined],
  ])(
    "refuses a %s address before touching the database",
    async (_case, slug) => {
      const { db, getBySlug } = setup();

      await expect(getBySlug({ slug })).rejects.toMatchObject(INVALID_INPUT);
      expect(db.query.store.findFirst).not.toHaveBeenCalled();
    }
  );
});

describe("store.create", () => {
  test("stores the validated store, then drops what was cached at its address", async () => {
    const { create, db } = setup({ role: "superadmin" });
    db.$["insert.returning"].mockResolvedValue([makeRow()]);

    await expect(
      create(makeInput({ colorAccent: "#C8F31D", name: " Sample Store " }))
    ).resolves.toEqual({ ...makeRow(), translations: [] });

    const { translations: _translations, ...columns } = makeInput();
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith(columns);
    expect(invalidateStoreCache).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 7, slug: "sample-store" })
    );
    // A new store has no articles to drop.
    expect(invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test.each([
    ["a reserved address", { slug: "admin" }],
    ["a malformed color", { colorAccent: "red" }],
    ["a palette that fails AA contrast", { colorForeground: "#f2f3f0" }],
  ])(
    "refuses %s before touching the database or the cache",
    async (_case, overrides) => {
      const { create, db } = setup({ role: "superadmin" });

      await expect(create(makeInput(overrides))).rejects.toMatchObject(
        INVALID_INPUT
      );
      expect(db.$.insert).not.toHaveBeenCalled();
      expect(invalidateStoreCache).not.toHaveBeenCalled();
    }
  );

  test("refuses a signed-out caller before touching the database", async () => {
    const { create, db } = setup();

    await expect(create(makeInput())).rejects.toMatchObject(SIGNED_OUT);
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(invalidateStoreCache).not.toHaveBeenCalled();
  });

  test("leaves the cache alone when the store was not stored", async () => {
    const { create, db } = setup({ role: "superadmin" });
    db.$["insert.returning"].mockResolvedValue([]);

    await expect(create(makeInput())).rejects.toThrow(
      "Inserting a store returned no row"
    );
    expect(invalidateStoreCache).not.toHaveBeenCalled();
  });
});

describe("store.update", () => {
  test("replaces the store by the id in the path, then drops what was cached about it and its articles", async () => {
    const { db, update } = setup({ role: "superadmin" });
    db.$["update.returning"].mockResolvedValue([
      makeRow({ slug: "renamed-store" }),
    ]);

    await expect(
      update({ ...makeInput({ slug: "renamed-store" }), id: "7" })
    ).resolves.toEqual({
      ...makeRow({ slug: "renamed-store" }),
      translations: [],
    });

    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      sql: '"store"."id" = $1',
      params: [7],
    });
    expect(invalidateStoreCache).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 7, slug: "renamed-store" })
    );
    // Its articles show its currency.
    expect(invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(7);
  });

  test("answers NOT_FOUND for an id that matches nothing, leaving the cache alone", async () => {
    const { update } = setup({ role: "superadmin" });

    await expect(update({ ...makeInput(), id: 404 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
    expect(invalidateStoreCache).not.toHaveBeenCalled();
    expect(invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test.each([
    ["a reserved address", { slug: "api" }],
    ["a palette that fails AA contrast", { colorSurface: "#7c7c7c" }],
    ["no id", { id: undefined }],
  ])("refuses %s before touching the database", async (_case, overrides) => {
    const { db, update } = setup({ role: "superadmin" });

    await expect(
      update({ ...makeInput(), id: 7, ...overrides })
    ).rejects.toMatchObject(INVALID_INPUT);
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("refuses a signed-out caller before touching the database", async () => {
    const { db, update } = setup();

    await expect(update({ ...makeInput(), id: 7 })).rejects.toMatchObject(
      SIGNED_OUT
    );
    expect(db.$.update).not.toHaveBeenCalled();
    expect(invalidateStoreCache).not.toHaveBeenCalled();
    expect(invalidateCatalogCache).not.toHaveBeenCalled();
  });
});

describe("store writes", () => {
  test("re-check the superadmin under a share lock inside the write's transaction", async () => {
    const { create, db } = setup({ role: "superadmin" });
    // The transaction's own handle: the lock and the write must both use it.
    const tx = createMockDatabase();
    db.$.transaction.mockImplementation(
      async (callback: unknown) =>
        await (callback as (handle: unknown) => Promise<unknown>)(tx)
    );
    tx.$["select.for"].mockResolvedValue([{ id: "test-user-id" }]);
    tx.$["insert.returning"].mockResolvedValue([makeRow()]);

    await create(makeInput());

    expect(tx.$["select.for"]).toHaveBeenCalledExactlyOnceWith("share");
    expect(tx.$.insert).toHaveBeenCalledWith(store);
    expect(tx.$["select.for"].mock.invocationCallOrder[0]).toBeLessThan(
      tx.$.insert.mock.invocationCallOrder[0] ?? 0
    );
    expect(db.$["select.for"]).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("refuse a superadmin demoted after the procedure's check, writing nothing", async () => {
    const { create, db } = setup({ role: "superadmin" });
    db.$["select.for"].mockResolvedValue([]);

    await expect(create(makeInput())).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Forbidden",
    });
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(invalidateStoreCache).not.toHaveBeenCalled();
  });

  test("refuse a member before touching the database: opening and editing stores is a superadmin's", async () => {
    const { create, db, update } = setup({ role: "member" });
    const refused = { code: "FORBIDDEN", message: "Forbidden" };

    await expect(create(makeInput())).rejects.toMatchObject(refused);
    await expect(update({ ...makeInput(), id: 7 })).rejects.toMatchObject(
      refused
    );
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(db.$.update).not.toHaveBeenCalled();
    expect(invalidateStoreCache).not.toHaveBeenCalled();
    expect(invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test("check the role the database holds for the caller, not the session's copy", async () => {
    const { create, db } = setup({ role: "superadmin" });
    db.$["insert.returning"].mockResolvedValue([makeRow()]);

    await create(makeInput());

    const [config] = db.query.user.findFirst.mock.calls[0] ?? [];
    expect(renderQuery((config as { where: unknown }).where)).toEqual({
      params: ["test-user-id"],
      sql: '"user"."id" = $1',
    });
  });
});
