import { format } from "node:util";

import {
  type BetterAuthOptions,
  betterAuth,
  type DBAdapter,
} from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { APIError } from "better-auth/api";
import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { REDACTED } from "@/lib/redaction";
import {
  makeSessionQueryError,
  SESSION_QUERY,
  SYNTHETIC_SESSION_TOKEN,
} from "@/test/session-query-error";

import { betterAuthLogger, writeBetterAuthLog } from "./logger";

const { captureExceptionWithScope } = vi.hoisted(() => ({
  captureExceptionWithScope: vi.fn(),
}));

vi.mock("@/lib/sentry", () => ({ captureExceptionWithScope }));

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

/** Everything written to the console, which is what reaches the runtime logs. */
function captureConsole() {
  const writes: { method: string; line: string }[] = [];
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      writes.push({ method, line: format(...args) });
    });
  }
  return {
    writes,
    output: () => writes.map(({ line }) => line).join("\n"),
  };
}

function parsed(line: string | undefined): unknown {
  return JSON.parse(line ?? "null");
}

/**
 * A real Better Auth instance with this logger, over a memory store whose
 * session lookup can be made to fail exactly as Drizzle does: with the token
 * Better Auth queried bound into the error.
 */
function setupAuth() {
  const store: Record<string, Record<string, unknown>[]> = {
    account: [],
    session: [],
    user: [],
    verification: [],
  };
  const sessionLookup = { failing: false };
  const memory = memoryAdapter(store);
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "synthetic-better-auth-secret-0123456789abcdef",
    emailAndPassword: { enabled: true },
    logger: betterAuthLogger,
    database: (options: BetterAuthOptions): DBAdapter => {
      const adapter = memory(options);
      return {
        ...adapter,
        findOne: async (query) => {
          if (sessionLookup.failing && query.model === "session") {
            throw new DrizzleQueryError(
              SESSION_QUERY,
              query.where.map((condition) => condition.value),
              new Error("Connection terminated unexpectedly")
            );
          }
          return await adapter.findOne(query);
        },
      };
    },
  });

  async function signUp() {
    const { headers } = await auth.api.signUpEmail({
      body: {
        email: "logger-test@example.com",
        name: "Logger Test",
        password: "synthetic-password-123",
      },
      returnHeaders: true,
    });
    const sessionToken = store.session?.[0]?.token;
    if (typeof sessionToken !== "string") {
      throw new TypeError("sign-up did not create a session");
    }
    const cookie = (headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    return { cookieHeaders: new Headers({ cookie }), sessionToken };
  }

  return { auth, sessionLookup, signUp };
}

describe("Better Auth logger", () => {
  test("a failed session lookup is reported without its token", async () => {
    const { auth, sessionLookup, signUp } = setupAuth();
    const { cookieHeaders, sessionToken } = await signUp();
    const { output, writes } = captureConsole();
    sessionLookup.failing = true;

    await expect(
      auth.api.getSession({ headers: cookieHeaders })
    ).rejects.toMatchObject({ body: { code: "FAILED_TO_GET_SESSION" } });

    expect(writes.map(({ method }) => method)).toContain("error");
    expect(output()).toContain("INTERNAL_SERVER_ERROR");
    expect(output()).toContain(`params: ${REDACTED}`);
    expect(output()).not.toContain(sessionToken);
  });

  test("a failed session lookup reaches Sentry once, as its cause", async () => {
    const { auth, sessionLookup, signUp } = setupAuth();
    const { cookieHeaders } = await signUp();
    captureConsole();
    sessionLookup.failing = true;

    await expect(
      auth.api.getSession({ headers: cookieHeaders })
    ).rejects.toMatchObject({ body: { code: "FAILED_TO_GET_SESSION" } });

    // The query error, not the APIError Better Auth answered with.
    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        query: SESSION_QUERY,
        cause: new Error("Connection terminated unexpectedly"),
      }),
      { action: "Auth.better_auth_log" }
    );
  });
});

describe("Sentry reporting", () => {
  test("reports the first Error of an error line", () => {
    captureConsole();
    const cause = new Error("connection refused");

    writeBetterAuthLog(
      "error",
      "INTERNAL_SERVER_ERROR",
      { at: 1 },
      cause,
      new Error("a later one")
    );

    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(cause, {
      action: "Auth.better_auth_log",
    });
  });

  test("passes over Better Auth's own APIError to the Error after it", () => {
    captureConsole();
    const cause = new Error("connection refused");

    writeBetterAuthLog(
      "error",
      "INTERNAL_SERVER_ERROR",
      new APIError(500),
      cause
    );

    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(cause, {
      action: "Auth.better_auth_log",
    });
  });

  test("reports a message that is the caught error itself", () => {
    captureConsole();
    const error = makeSessionQueryError();

    writeBetterAuthLog("error", error);

    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(error, {
      action: "Auth.better_auth_log",
    });
  });

  test("skips Better Auth's own APIError and lines without an Error", () => {
    captureConsole();

    writeBetterAuthLog("error", "INTERNAL_SERVER_ERROR", new APIError(500));
    writeBetterAuthLog("error", "Endpoint path conflicts detected");

    expect(captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test("reports nothing below the error level", () => {
    captureConsole();

    writeBetterAuthLog("warn", "Slow query", new Error("timeout"));

    expect(captureExceptionWithScope).not.toHaveBeenCalled();
  });
});

describe("writeBetterAuthLog", () => {
  test("writes one JSON line at Better Auth's level with the sanitized arguments", () => {
    const { output, writes } = captureConsole();

    writeBetterAuthLog("warn", "Rate limit", makeSessionQueryError(), {
      where: [{ field: "token", value: SYNTHETIC_SESSION_TOKEN }],
    });

    expect(output()).not.toContain(SYNTHETIC_SESSION_TOKEN);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.method).toBe("warn");
    expect(parsed(writes[0]?.line)).toEqual({
      level: "warn",
      action: "Auth.better_auth_log",
      message: "Rate limit",
      details: [
        expect.objectContaining({
          message: `Failed query: ${SESSION_QUERY}\nparams: ${REDACTED}`,
        }),
        { where: [{ field: "token", value: REDACTED }] },
      ],
    });
  });

  test("scrubs a message that itself embeds a failed query", () => {
    const { writes } = captureConsole();

    writeBetterAuthLog("error", makeSessionQueryError().message);

    expect(writes[0]?.method).toBe("error");
    expect(parsed(writes[0]?.line)).toEqual({
      level: "error",
      action: "Auth.better_auth_log",
      message: `Failed query: ${SESSION_QUERY}\nparams: ${REDACTED}`,
    });
  });

  test("sanitizes a message that is the caught error itself", () => {
    const { output, writes } = captureConsole();

    // Some Better Auth call sites log `logger.error(e)` despite the typing.
    writeBetterAuthLog("error", makeSessionQueryError());

    expect(output()).not.toContain(SYNTHETIC_SESSION_TOKEN);
    expect(parsed(writes[0]?.line)).toMatchObject({
      message: {
        name: "Error",
        message: `Failed query: ${SESSION_QUERY}\nparams: ${REDACTED}`,
        cause: { code: "57P01" },
      },
    });
  });

  test("logs null and absent arguments as JSON nulls", () => {
    const { writes } = captureConsole();

    writeBetterAuthLog("info", "Session refreshed", null, undefined);

    expect(writes[0]?.method).toBe("info");
    expect(parsed(writes[0]?.line)).toEqual({
      level: "info",
      action: "Auth.better_auth_log",
      message: "Session refreshed",
      details: [null, null],
    });
  });

  test("writes a bigint as a string instead of throwing", () => {
    const { writes } = captureConsole();

    writeBetterAuthLog("debug", "Counted", { total: 12n });

    expect(writes[0]?.method).toBe("debug");
    expect(parsed(writes[0]?.line)).toMatchObject({
      details: [{ total: "12" }],
    });
  });
});
