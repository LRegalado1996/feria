import { call, ORPCError } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { ERROR_WHYS } from "@/lib/errors";
import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test";
import { renderQuery } from "@/server/test/render-sql";

import { adminProcedure, createORPCContext, publicProcedure } from ".";

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(
    async (): Promise<{ headers: Headers; response: unknown }> =>
      await Promise.resolve({ headers: new Headers(), response: null })
  ),
}));

vi.mock("@/server/better-auth", () => ({ auth: { api: { getSession } } }));

const { requestLog } = vi.hoisted(() => ({ requestLog: { set: vi.fn() } }));

vi.mock("@/server/api/utils/logger", () => ({
  safeRequestLogger: () => requestLog,
}));

const UNAUTHORIZED = { code: "UNAUTHORIZED", message: "Unauthorized" };

const SESSION = {
  user: { id: "user-123", email: "test@example.com", name: "Test User" },
  session: { id: "session-1", userId: "user-123" },
};

/** Better Auth's answer when it re-read the session and renewed its cache. */
function renewedSession() {
  const headers = new Headers();
  headers.append("set-cookie", "better-auth.session_data=abc; Max-Age=300");
  headers.append("set-cookie", "better-auth.session_token=def; Max-Age=600");
  return { headers, response: SESSION };
}

describe("createORPCContext", () => {
  test("resolves the session from the request headers", async () => {
    getSession.mockResolvedValueOnce(renewedSession());
    const headers = new Headers({ cookie: "session=abc" });

    const context = await createORPCContext({ headers });

    expect(getSession).toHaveBeenCalledExactlyOnceWith({
      headers,
      returnHeaders: true,
    });
    expect(context.session).toEqual(SESSION);
    expect(context.headers).toBe(headers);
  });

  test("forwards every cookie Better Auth set to the response", async () => {
    getSession.mockResolvedValueOnce(renewedSession());
    const resHeaders = new Headers();

    await createORPCContext({ headers: new Headers(), resHeaders });

    expect(resHeaders.getSetCookie()).toEqual([
      "better-auth.session_data=abc; Max-Age=300",
      "better-auth.session_token=def; Max-Age=600",
    ]);
  });

  test("keeps the response headers and abort signal it is given", async () => {
    const resHeaders = new Headers();
    const { signal } = new AbortController();

    const context = await createORPCContext({
      headers: new Headers(),
      resHeaders,
      signal,
    });

    expect(context.resHeaders).toBe(resHeaders);
    expect(context.signal).toBe(signal);
  });

  test("has no response headers or signal outside an HTTP request", async () => {
    const context = await createORPCContext({ headers: new Headers() });

    expect(context).not.toHaveProperty("resHeaders");
    expect(context).not.toHaveProperty("signal");
  });
});

describe("error contract", () => {
  test("a typed error carries its data to the caller", async () => {
    const { mockCtx } = createMockContext();
    const procedure = publicProcedure.handler(({ errors }) => {
      throw errors.NOT_FOUND({
        message: "That order no longer exists.",
        data: { fix: "Refresh the page.", why: ERROR_WHYS.DATABASE },
      });
    });

    await expect(
      call(procedure, undefined, { context: mockCtx as never })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "That order no longer exists.",
      defined: true,
      data: { fix: "Refresh the page.", why: ERROR_WHYS.DATABASE },
    });
  });

  test("TOO_MANY_REQUESTS states when to retry", async () => {
    const { mockCtx } = createMockContext();
    const procedure = publicProcedure.handler(({ errors }) => {
      throw errors.TOO_MANY_REQUESTS({ data: { retryAfter: 30 } });
    });

    await expect(
      call(procedure, undefined, { context: mockCtx as never })
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      defined: true,
      data: { retryAfter: 30 },
    });
  });

  test("a why outside the allowlist does not pass as a defined error", async () => {
    const { mockCtx } = createMockContext();
    const procedure = publicProcedure.handler(() => {
      throw new ORPCError("CONFLICT", { data: { why: "duplicate key value" } });
    });

    await expect(
      call(procedure, undefined, { context: mockCtx as never })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      defined: false,
    });
  });
});

describe("timing", () => {
  test("records each call's procedure and duration on the request log", async () => {
    const { mockCtx } = createMockContext();
    const procedure = publicProcedure.handler(() => "done");
    // Start, then end: 41.6 ms rounds to 42.
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1041.6);

    await call(procedure, undefined, {
      context: mockCtx as never,
      path: ["category", "create"],
    });

    expect(requestLog.set).toHaveBeenCalledExactlyOnceWith({
      orpc: { procedure: "category.create", durationMs: 42 },
    });
  });

  test("records a call that failed too", async () => {
    const { mockCtx } = createUnauthenticatedMockContext();
    const procedure = adminProcedure.handler(() => "never");
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1003);

    await expect(
      call(procedure, undefined, { context: mockCtx as never, path: ["me"] })
    ).rejects.toMatchObject(UNAUTHORIZED);
    expect(requestLog.set).toHaveBeenCalledExactlyOnceWith({
      orpc: { procedure: "me", durationMs: 3 },
    });
  });
});

/**
 * A signed-in caller (or none) the database still has as a login (or not),
 * and the store row it answers with (or none): `adminProcedure` reads both.
 */
function setupAdmin({
  login = true,
  signedIn = true,
  store = { id: 4 },
}: {
  login?: boolean;
  signedIn?: boolean;
  store?: { id: number } | null;
} = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  mockCtx.db.query.user.findFirst.mockImplementation(async () =>
    login ? { id: "test-user-id" } : undefined
  );
  mockCtx.db.$["select.limit"].mockImplementation(async () =>
    store ? [store] : []
  );
  const procedure = adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(({ context, input }) => ({
      id: input.id,
      storeId: context.store.id,
      userId: context.session.user.id,
    }));

  return {
    db: mockCtx.db,
    callAdmin: async (input: unknown, context: unknown = mockCtx) =>
      await call(procedure, input as never, { context: context as never }),
  };
}

describe("adminProcedure", () => {
  test("hands the handler the signed-in login and the store", async () => {
    const { callAdmin } = setupAdmin();

    await expect(callAdmin({ id: 7 })).resolves.toEqual({
      id: 7,
      storeId: 4,
      userId: "test-user-id",
    });
  });

  test("re-reads the login by its id, then reads the store's one row", async () => {
    const { callAdmin, db } = setupAdmin();

    await callAdmin({ id: 7 });

    const [config] = db.query.user.findFirst.mock.calls[0] ?? [];
    expect(config).toMatchObject({ columns: { id: true } });
    expect(renderQuery((config as { where: unknown }).where)).toEqual({
      params: ["test-user-id"],
      sql: '"user"."id" = $1',
    });
    expect(db.$["select.limit"]).toHaveBeenCalledExactlyOnceWith(1);
    expect(db.query.user.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      db.$.select.mock.invocationCallOrder[0] ?? 0
    );
  });

  test("refuses a login the database no longer has, whatever the session says, before reading the store", async () => {
    const { callAdmin, db } = setupAdmin({ login: false });

    await expect(callAdmin({ id: 7 })).rejects.toMatchObject(UNAUTHORIZED);
    expect(db.$.select).not.toHaveBeenCalled();
  });

  test("answers NOT_FOUND when the store's row does not exist", async () => {
    const { callAdmin } = setupAdmin({ store: null });

    await expect(callAdmin({ id: 7 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
  });

  test("refuses a caller without a session before reading anything", async () => {
    const { callAdmin, db } = setupAdmin({ signedIn: false });

    await expect(callAdmin({ id: 7 })).rejects.toMatchObject(UNAUTHORIZED);
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
    expect(db.$.select).not.toHaveBeenCalled();
  });

  test("refuses a session without a user before reading anything", async () => {
    const { callAdmin, db } = setupAdmin();
    const { mockCtx } = createMockContext();

    await expect(
      callAdmin(
        { id: 7 },
        { ...mockCtx, db, session: { ...SESSION, user: null } }
      )
    ).rejects.toMatchObject(UNAUTHORIZED);
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
  });

  test("refuses a malformed input before reading the login or the store", async () => {
    const { callAdmin, db } = setupAdmin();

    await expect(callAdmin({ id: "seven" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
    expect(db.$.select).not.toHaveBeenCalled();
  });

  test("checks the session before the input: a caller without one is UNAUTHORIZED, malformed input or not", async () => {
    const { callAdmin } = setupAdmin({ signedIn: false });

    await expect(callAdmin({ id: "seven" })).rejects.toMatchObject(
      UNAUTHORIZED
    );
  });
});
