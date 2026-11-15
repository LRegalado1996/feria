import { call, ORPCError } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { ERROR_WHYS } from "@/lib/errors";
import { storeScopeSchema } from "@/lib/schemas/access";
import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test";
import { renderQuery } from "@/server/test/render-sql";

import {
  createORPCContext,
  protectedProcedure,
  publicProcedure,
  storeProcedure,
  superadminProcedure,
} from ".";

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
        message: "That post no longer exists.",
        data: { fix: "Refresh the feed.", why: ERROR_WHYS.DATABASE },
      });
    });

    await expect(
      call(procedure, undefined, { context: mockCtx as never })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "That post no longer exists.",
      defined: true,
      data: { fix: "Refresh the feed.", why: ERROR_WHYS.DATABASE },
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
      path: ["post", "create"],
    });

    expect(requestLog.set).toHaveBeenCalledExactlyOnceWith({
      orpc: { procedure: "post.create", durationMs: 42 },
    });
  });

  test("records a call that failed too", async () => {
    const { mockCtx } = createUnauthenticatedMockContext();
    const procedure = protectedProcedure.handler(() => "never");
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

describe("protectedProcedure", () => {
  test("refuses a caller without a session", async () => {
    const { mockCtx } = createUnauthenticatedMockContext();
    const procedure = protectedProcedure.handler(() => "protected");

    await expect(
      call(procedure, undefined, { context: mockCtx as never })
    ).rejects.toMatchObject(UNAUTHORIZED);
  });

  test("refuses a session without a user", async () => {
    const { mockCtx } = createMockContext();
    const procedure = protectedProcedure.handler(() => "protected");

    await expect(
      call(procedure, undefined, {
        context: { ...mockCtx, session: { ...SESSION, user: null } } as never,
      })
    ).rejects.toMatchObject(UNAUTHORIZED);
  });

  test("hands the signed-in user to the handler", async () => {
    const { mockCtx } = createMockContext();
    const procedure = protectedProcedure.handler(
      ({ context }) => context.session.user.id
    );

    await expect(
      call(procedure, undefined, { context: mockCtx as never })
    ).resolves.toBe("test-user-id");
  });
});

/**
 * A signed-in caller (or none) whose role the database answers with, and a
 * store the access query answers with: the builders read both there.
 */
function setupAccess({
  role = "member",
  signedIn = true,
  store = null,
}: {
  role?: "member" | "superadmin" | null;
  signedIn?: boolean;
  store?: { id: number; slug: string } | null;
} = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  mockCtx.db.query.user.findFirst.mockImplementation(async () =>
    role === null ? undefined : { role }
  );
  mockCtx.db.$["select.limit"].mockImplementation(async () =>
    store ? [store] : []
  );
  const options = { context: mockCtx as never };

  const platform = superadminProcedure.handler(() => "platform");
  const scoped = storeProcedure(storeScopeSchema).handler(({ context }) => ({
    storeId: context.store.id,
  }));

  return {
    db: mockCtx.db,
    callPlatform: async () => await call(platform, undefined, options),
    callStore: async (input: unknown) =>
      await call(scoped, input as never, options),
  };
}

describe("superadminProcedure", () => {
  test("lets a superadmin through", async () => {
    const { callPlatform } = setupAccess({ role: "superadmin" });

    await expect(callPlatform()).resolves.toBe("platform");
  });

  test.each([
    ["a member", "member"],
    ["a user the database no longer has", null],
  ] as const)("refuses %s with FORBIDDEN", async (_case, role) => {
    const { callPlatform } = setupAccess({ role });

    await expect(callPlatform()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Forbidden",
    });
  });

  test("reads the role of the signed-in user from the database", async () => {
    const { callPlatform, db } = setupAccess({ role: "superadmin" });

    await callPlatform();

    const [config] = db.query.user.findFirst.mock.calls[0] ?? [];
    expect(config).toMatchObject({ columns: { role: true } });
    expect(renderQuery((config as { where: unknown }).where)).toEqual({
      params: ["test-user-id"],
      sql: '"user"."id" = $1',
    });
  });

  test("refuses a caller without a session before reading anything", async () => {
    const { callPlatform, db } = setupAccess({ signedIn: false });

    await expect(callPlatform()).rejects.toMatchObject(UNAUTHORIZED);
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
  });
});

describe("storeProcedure", () => {
  test("hands the handler the store the caller may work on", async () => {
    const { callStore } = setupAccess({
      store: { id: 4, slug: "lr-market" },
    });

    await expect(callStore({ storeSlug: "lr-market" })).resolves.toEqual({
      storeId: 4,
    });
  });

  test("resolves the slug against the signed-in user's access, in one query", async () => {
    const { callStore, db } = setupAccess({
      store: { id: 4, slug: "lr-market" },
    });

    await callStore({ storeSlug: "lr-market" });

    const { params, sql } = renderQuery(
      db.$["select.where"].mock.calls[0]?.[0]
    );
    expect(params).toEqual([
      "lr-market",
      "test-user-id",
      "superadmin",
      "test-user-id",
    ]);
    expect(sql).toContain('"store"."slug" = $1');
    expect(sql).toContain('"user"."role" = $3');
    expect(sql).toContain('"store_member"."userId" = $4');
  });

  test("answers NOT_FOUND for a store the caller may not work on, as for one that does not exist", async () => {
    const { callStore } = setupAccess({ store: null });

    await expect(callStore({ storeSlug: "tienda-demo" })).rejects.toMatchObject(
      { code: "NOT_FOUND", message: "Store not found" }
    );
  });

  test("refuses a caller without a session before resolving the store", async () => {
    const { callStore, db } = setupAccess({ signedIn: false });

    await expect(callStore({ storeSlug: "lr-market" })).rejects.toMatchObject(
      UNAUTHORIZED
    );
    expect(db.$.select).not.toHaveBeenCalled();
  });

  test("refuses an input without a valid store slug before resolving it", async () => {
    const { callStore, db } = setupAccess();

    await expect(callStore({ storeSlug: "Not A Slug" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
    expect(db.$.select).not.toHaveBeenCalled();
  });
});
