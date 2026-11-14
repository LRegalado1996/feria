import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { storeRouter } from "./store";

// The router is input → auth → service → cache. These tests cover that
// wiring; the queries are `src/server/services/store.test.ts`'s and the
// rules of each field `src/lib/schemas/store/store.test.ts`'s.

const { invalidateStoreCache } = vi.hoisted(() => ({
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

// Every variable the production gate reads, cleared, so the machine running
// the test cannot leak its own Vercel environment in.
const UNSET = {
  VERCEL_ENV: "",
  VERCEL_GIT_COMMIT_REF: "",
  VERCEL_TARGET_ENV: "",
};

function setup({
  env = {},
  signedIn = false,
}: { env?: Partial<typeof UNSET>; signedIn?: boolean } = {}) {
  for (const [name, value] of Object.entries({ ...UNSET, ...env })) {
    vi.stubEnv(name, value);
  }

  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
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
    const { create, db } = setup({ signedIn: true });
    db.$["insert.returning"].mockResolvedValue([makeRow()]);

    await expect(
      create(makeInput({ colorAccent: "#C8F31D", name: " Sample Store " }))
    ).resolves.toEqual({ ...makeRow(), translations: [] });

    const { translations: _translations, ...columns } = makeInput();
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith(columns);
    expect(invalidateStoreCache).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 7, slug: "sample-store" })
    );
  });

  test.each([
    ["a reserved address", { slug: "admin" }],
    ["a malformed color", { colorAccent: "red" }],
    ["a palette that fails AA contrast", { colorForeground: "#f2f3f0" }],
  ])(
    "refuses %s before touching the database or the cache",
    async (_case, overrides) => {
      const { create, db } = setup({ signedIn: true });

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
    const { create, db } = setup({ signedIn: true });
    db.$["insert.returning"].mockResolvedValue([]);

    await expect(create(makeInput())).rejects.toThrow(
      "Inserting a store returned no row"
    );
    expect(invalidateStoreCache).not.toHaveBeenCalled();
  });
});

describe("store.update", () => {
  test("replaces the store by the id in the path, then drops what was cached about it", async () => {
    const { db, update } = setup({ signedIn: true });
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
  });

  test("answers NOT_FOUND for an id that matches nothing, leaving the cache alone", async () => {
    const { update } = setup({ signedIn: true });

    await expect(update({ ...makeInput(), id: 404 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
    expect(invalidateStoreCache).not.toHaveBeenCalled();
  });

  test.each([
    ["a reserved address", { slug: "api" }],
    ["a palette that fails AA contrast", { colorSurface: "#7c7c7c" }],
    ["no id", { id: undefined }],
  ])("refuses %s before touching the database", async (_case, overrides) => {
    const { db, update } = setup({ signedIn: true });

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
  });
});

describe("store writes on production, until roles exist", () => {
  test.each([
    ["the Vercel production deployment", { VERCEL_ENV: "production" }],
    ["the production branch", { VERCEL_GIT_COMMIT_REF: "main" }],
    ["a production target", { VERCEL_TARGET_ENV: "production" }],
  ] as const)(
    "%s refuses a signed-in caller's create and update before touching the database",
    async (_case, env) => {
      const { create, db, update } = setup({ env, signedIn: true });
      const refused = {
        code: "FORBIDDEN",
        message: "Stores cannot be changed here yet",
      };

      await expect(create(makeInput())).rejects.toMatchObject(refused);
      await expect(update({ ...makeInput(), id: 7 })).rejects.toMatchObject(
        refused
      );
      expect(db.$.insert).not.toHaveBeenCalled();
      expect(db.$.update).not.toHaveBeenCalled();
      expect(invalidateStoreCache).not.toHaveBeenCalled();
    }
  );

  test("a preview or qa deployment still accepts the write", async () => {
    const { create, db } = setup({
      env: { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" },
      signedIn: true,
    });
    db.$["insert.returning"].mockResolvedValue([makeRow()]);

    await expect(create(makeInput())).resolves.toEqual({
      ...makeRow(),
      translations: [],
    });
  });

  test("production still serves the public read", async () => {
    const { db, getBySlug } = setup({ env: { VERCEL_ENV: "production" } });
    const found = { id: 7, name: "Sample Store", slug: "sample-store" };
    db.query.store.findFirst.mockResolvedValue(found);

    await expect(getBySlug({ slug: "sample-store" })).resolves.toEqual(found);
  });

  test("a signed-out caller on production is told to sign in, not that writes are closed", async () => {
    const { create } = setup({ env: { VERCEL_ENV: "production" } });

    await expect(create(makeInput())).rejects.toMatchObject(SIGNED_OUT);
  });
});
