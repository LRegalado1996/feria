import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { comingSoon, comingSoonTranslation } from "@/server/db/schema";
import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { comingSoonRouter } from "./coming-soon";

// The router is input → auth → service → cache. These tests cover that
// wiring; the queries are `src/server/services/coming-soon.test.ts`'s and
// the rules of each field `src/lib/schemas/coming-soon/coming-soon.test.ts`'s.

const { invalidateComingSoonCache } = vi.hoisted(() => ({
  invalidateComingSoonCache: vi.fn<() => void>(),
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

// Next's tag cache only exists inside a Next request.
vi.mock("@/server/cache/coming-soon", () => ({ invalidateComingSoonCache }));

const SIGNED_OUT = { code: "UNAUTHORIZED", message: "Unauthorized" };
const INVALID_INPUT = {
  code: "BAD_REQUEST",
  message: "Input validation failed",
};

const STORE_ID = 7;

function makeTexts(overrides: Record<string, unknown> = {}) {
  return {
    eyebrow: null,
    headline: "Abrimos",
    lead: null,
    locale: "es",
    marquee: null,
    ...overrides,
  };
}

/**
 * A caller, signed out by default, or signed in with a login the database
 * still has (or not), re-read by `adminProcedure` and again under a share
 * lock inside each write.
 */
function setup({
  isLogin = true,
  signedIn = false,
}: { isLogin?: boolean; signedIn?: boolean } = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  mockCtx.db.query.user.findFirst.mockResolvedValue(
    isLogin ? { id: "test-user-id" } : undefined
  );
  mockCtx.db.$["select.limit"].mockResolvedValue([{ id: STORE_ID }]);
  mockCtx.db.$["select.for"].mockResolvedValue(
    isLogin ? [{ id: "test-user-id" }] : []
  );
  const options = { context: mockCtx as never };

  return {
    db: mockCtx.db,
    get: async () => await call(comingSoonRouter.get, undefined, options),
    setPublished: async (input: unknown) =>
      await call(comingSoonRouter.setPublished, input as never, options),
    update: async (input: unknown) =>
      await call(comingSoonRouter.update, input as never, options),
  };
}

describe("comingSoon.get", () => {
  test("serves a signed-in admin the page: its switch, its day and its texts", async () => {
    const { db, get } = setup({ signedIn: true });
    const found = {
      countdownTo: "2026-12-20",
      published: true,
      translations: [makeTexts()],
    };
    db.query.comingSoon.findFirst.mockResolvedValue(found);

    await expect(get()).resolves.toEqual(found);
  });

  test("refuses a signed-out visitor before reading anything: whether the store opens is the admin's business", async () => {
    const { db, get } = setup();

    await expect(get()).rejects.toMatchObject(SIGNED_OUT);
    expect(db.query.comingSoon.findFirst).not.toHaveBeenCalled();
  });
});

describe("comingSoon.setPublished", () => {
  test.each([true, false])(
    "an admin sets published %s on the store's own page, then drops the cached page",
    async (published) => {
      const { db, setPublished } = setup({ signedIn: true });
      db.$["insert.returning"].mockResolvedValue([{ published }]);

      await expect(setPublished({ published })).resolves.toEqual({
        published,
      });
      expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(comingSoon);
      expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
        published,
        storeId: STORE_ID,
      });
      expect(invalidateComingSoonCache).toHaveBeenCalledExactlyOnceWith();
    }
  );

  test("refuses a signed-out visitor before validating or writing", async () => {
    const { db, setPublished } = setup();

    await expect(setPublished({ published: false })).rejects.toMatchObject(
      SIGNED_OUT
    );
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(invalidateComingSoonCache).not.toHaveBeenCalled();
  });

  test("refuses a login removed since its session began, writing nothing", async () => {
    const { db, setPublished } = setup({ isLogin: false, signedIn: true });

    await expect(setPublished({ published: false })).rejects.toMatchObject(
      SIGNED_OUT
    );
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("refuses a switch that is not a boolean", async () => {
    const { db, setPublished } = setup({ signedIn: true });

    await expect(setPublished({ published: "no" })).rejects.toMatchObject(
      INVALID_INPUT
    );
    expect(db.$.insert).not.toHaveBeenCalled();
  });
});

describe("comingSoon.update", () => {
  test("an admin replaces the texts and the day of the store's own page, then drops the cached page", async () => {
    const { db, update } = setup({ signedIn: true });
    db.$["insert.returning"]
      .mockResolvedValueOnce([{ countdownTo: null, id: 3, published: true }])
      .mockResolvedValueOnce([makeTexts()]);

    await expect(
      update({
        countdownTo: null,
        translations: [makeTexts({ headline: " Abrimos " })],
      })
    ).resolves.toEqual({
      countdownTo: null,
      published: true,
      translations: [makeTexts()],
    });
    expect(db.$.insert.mock.calls).toEqual([
      [comingSoon],
      [comingSoonTranslation],
    ]);
    // The store comes from the session's login, never from the input.
    expect(db.$["insert.values"].mock.calls[0]).toEqual([
      { countdownTo: null, storeId: STORE_ID },
    ]);
    expect(invalidateComingSoonCache).toHaveBeenCalledExactlyOnceWith();
  });

  test("never takes the switch or a store from the input", async () => {
    const { db, update } = setup({ signedIn: true });
    db.$["insert.returning"]
      .mockResolvedValueOnce([{ countdownTo: null, id: 3, published: true }])
      .mockResolvedValueOnce([]);

    await update({
      countdownTo: null,
      published: false,
      storeId: 99,
      translations: [],
    });

    expect(db.$["insert.values"].mock.calls[0]).toEqual([
      { countdownTo: null, storeId: STORE_ID },
    ]);
  });

  test("refuses a signed-out visitor before validating or writing", async () => {
    const { db, update } = setup();

    await expect(
      update({ countdownTo: null, translations: [] })
    ).rejects.toMatchObject(SIGNED_OUT);
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(invalidateComingSoonCache).not.toHaveBeenCalled();
  });

  test("refuses a headline over its limit, writing nothing", async () => {
    const { db, update } = setup({ signedIn: true });

    await expect(
      update({
        countdownTo: null,
        translations: [makeTexts({ headline: "x".repeat(51) })],
      })
    ).rejects.toMatchObject(INVALID_INPUT);
    expect(db.$.insert).not.toHaveBeenCalled();
  });
});
