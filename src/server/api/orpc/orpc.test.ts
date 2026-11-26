import { call, ORPCError } from "@orpc/server";
import { APIError } from "better-auth/api";
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { ERROR_WHYS } from "@/lib/errors";
import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test";
import { renderQuery } from "@/server/test/render-sql";

import {
  adminProcedure,
  loginProcedure,
  createORPCContext,
  publicProcedure,
} from ".";

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(
    async (): Promise<{ headers: Headers; response: unknown }> =>
      await Promise.resolve({ headers: new Headers(), response: null })
  ),
}));

vi.mock("@/server/better-auth", () => ({ auth: { api: { getSession } } }));

const { captureExceptionWithScope } = vi.hoisted(() => ({
  captureExceptionWithScope: vi.fn(() => null),
}));

vi.mock("@/lib/sentry", () => ({ captureExceptionWithScope }));

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
    expect(context.sessionFailure).toBeNull();
    expect(context.headers).toBe(headers);
  });

  test("a session Better Auth could not read leaves the request without one, keeps why, and leaves the report to Better Auth", async () => {
    const outage = new APIError("INTERNAL_SERVER_ERROR");
    getSession.mockRejectedValueOnce(outage);
    const resHeaders = new Headers();

    const context = await createORPCContext({
      headers: new Headers({ cookie: "session=abc" }),
      resHeaders,
    });

    expect(context.session).toBeNull();
    expect(context.sessionFailure).toEqual({ error: outage });
    expect(resHeaders.getSetCookie()).toEqual([]);
    expect(captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test("a session read that failed outside Better Auth is reported once", async () => {
    const failure = new Error("headers unavailable");
    getSession.mockRejectedValueOnce(failure);

    const context = await createORPCContext({
      headers: new Headers({ "x-request-id": "req-1" }),
    });

    expect(context.sessionFailure).toEqual({ error: failure });
    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(failure, {
      action: "Api.read_session",
      requestId: "req-1",
    });
  });

  test("a failure report without a request id carries none", async () => {
    const failure = new Error("headers unavailable");
    getSession.mockRejectedValueOnce(failure);

    await createORPCContext({ headers: new Headers() });

    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(failure, {
      action: "Api.read_session",
      requestId: undefined,
    });
  });

  test("a public procedure still answers when the session could not be read", async () => {
    getSession.mockRejectedValueOnce(new Error("Failed to get session"));
    const context = await createORPCContext({ headers: new Headers() });
    const procedure = publicProcedure.handler(() => "the page");

    await expect(
      call(procedure, undefined, { context: context as never })
    ).resolves.toBe("the page");
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
  mustChangePassword = false,
  signedIn = true,
  store = { id: 4 },
}: {
  login?: boolean;
  mustChangePassword?: boolean;
  signedIn?: boolean;
  store?: { id: number } | null;
} = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  mockCtx.db.query.user.findFirst.mockImplementation(async () =>
    login ? { id: "test-user-id", mustChangePassword } : undefined
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

  test("re-reads the login by its id, enabled ones only, then reads the store's one row", async () => {
    const { callAdmin, db } = setupAdmin();

    await callAdmin({ id: 7 });

    const [config] = db.query.user.findFirst.mock.calls[0] ?? [];
    expect(config).toMatchObject({
      columns: { id: true, mustChangePassword: true },
    });
    expect(renderQuery((config as { where: unknown }).where)).toEqual({
      params: ["test-user-id", "test-session-id"],
      sql: '("user"."id" = $1 and "user"."disabledAt" is null and exists (select 1 from "session" where "session"."id" = $2 and "session"."userId" = "user"."id" and "session"."expiresAt" > now()))',
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

  test("refuses a login still on a temporary password with FORBIDDEN, before reading the store", async () => {
    const { callAdmin, db } = setupAdmin({ mustChangePassword: true });

    await expect(callAdmin({ id: 7 })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Change the temporary password first",
    });
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

  test("throws a session that could not be read as it was, before reading anything", async () => {
    const { callAdmin, db } = setupAdmin({ signedIn: false });
    const { mockCtx } = createUnauthenticatedMockContext();
    const outage = new Error("Failed to get session");

    await expect(
      callAdmin(
        { id: 7 },
        { ...mockCtx, db, sessionFailure: { error: outage } }
      )
    ).rejects.toBe(outage);
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

/**
 * A signed-in caller (or none) the database still has as an enabled login
 * (or not), on a temporary password or its own: `loginProcedure` reads it.
 */
function setupLogin({
  login = true,
  mustChangePassword = true,
  signedIn = true,
}: {
  login?: boolean;
  mustChangePassword?: boolean;
  signedIn?: boolean;
} = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  mockCtx.db.query.user.findFirst.mockImplementation(async () =>
    login ? { id: "test-user-id", mustChangePassword } : undefined
  );
  const procedure = loginProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .handler(({ context, input }) => ({ id: input.id, login: context.login }));

  return {
    db: mockCtx.db,
    callLogin: async (input: unknown) =>
      await call(procedure, input as never, { context: mockCtx as never }),
  };
}

describe("loginProcedure", () => {
  test.each([true, false])(
    "hands the handler the login re-read from the database, on a temporary password or not (%s)",
    async (mustChangePassword) => {
      const { callLogin, db } = setupLogin({ mustChangePassword });

      await expect(callLogin({ id: 7 })).resolves.toEqual({
        id: 7,
        login: { id: "test-user-id", mustChangePassword },
      });
      const [config] = db.query.user.findFirst.mock.calls[0] ?? [];
      expect(renderQuery((config as { where: unknown }).where)).toEqual({
        params: ["test-user-id", "test-session-id"],
        sql: '("user"."id" = $1 and "user"."disabledAt" is null and exists (select 1 from "session" where "session"."id" = $2 and "session"."userId" = "user"."id" and "session"."expiresAt" > now()))',
      });
      // It needs no store.
      expect(db.$.select).not.toHaveBeenCalled();
    }
  );

  test("refuses a login removed or disabled, whatever the session says", async () => {
    const { callLogin } = setupLogin({ login: false });

    await expect(callLogin({ id: 7 })).rejects.toMatchObject(UNAUTHORIZED);
  });

  test("refuses a caller without a session before reading anything", async () => {
    const { callLogin, db } = setupLogin({ signedIn: false });

    await expect(callLogin({ id: "seven" })).rejects.toMatchObject(
      UNAUTHORIZED
    );
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
  });

  test("refuses a malformed input before reading the login", async () => {
    const { callLogin, db } = setupLogin();

    await expect(callLogin({ id: "seven" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
  });
});
