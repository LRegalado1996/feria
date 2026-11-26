import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import type { MockDatabase } from "@/server/test/context";

import { auth, isAuthRateLimitDisabled } from "./config";
import { betterAuthLogger } from "./logger";
import { getTrustedOrigins } from "./trusted-origins";

describe("auth config", () => {
  test("routes Better Auth's own logs through the sanitizing logger", () => {
    expect(auth.options.logger).toBe(betterAuthLogger);
  });

  test("keeps rate-limit counters in the database, shared by every instance", () => {
    expect(auth.options.rateLimit?.storage).toBe("database");
  });

  test("allows 10 sign-in attempts a minute, and has no sign-up to limit", () => {
    expect(auth.options.rateLimit?.customRules).toEqual({
      "/sign-in/email": { window: 60, max: 10 },
    });
  });

  test("takes the sign-up path out of Better Auth's router", () => {
    expect(auth.options.disabledPaths).toEqual(["/sign-up/email"]);
  });

  test("closes sign-up: logins are created on the server only", () => {
    expect(auth.options.emailAndPassword).toEqual({
      enabled: true,
      disableSignUp: true,
    });
  });

  test("refuses to open a session for a login an admin disabled (FER-015)", async () => {
    const mockDb = db as unknown as MockDatabase;
    mockDb.query.user.findFirst.mockResolvedValue({
      disabledAt: new Date("2026-11-20T12:00:00.000Z"),
    });
    const before = auth.options.databaseHooks?.session?.create?.before;

    await expect(before?.({ userId: "user-1" })).rejects.toMatchObject({
      body: { code: "LOGIN_DISABLED", message: "This login is disabled" },
      statusCode: 403,
    });
  });

  test("opens a session for an enabled login", async () => {
    const mockDb = db as unknown as MockDatabase;
    mockDb.query.user.findFirst.mockResolvedValue({ disabledAt: null });
    const before = auth.options.databaseHooks?.session?.create?.before;

    await expect(before?.({ userId: "user-1" })).resolves.toBeUndefined();
  });

  test("declares the role as a field Better Auth never takes from a request", () => {
    expect(auth.options.user?.additionalFields?.role).toEqual({
      type: ["superadmin", "member"],
      required: true,
      defaultValue: "member",
      input: false,
    });
  });

  test("leaves the rate limiter to Better Auth's default without the e2e flag", () => {
    expect(auth.options.rateLimit).not.toHaveProperty("enabled");
  });

  test("turns the rate limiter off when the e2e server's flag is set", async () => {
    vi.stubEnv("E2E_DISABLE_AUTH_RATE_LIMIT", "true");
    vi.resetModules();

    const { auth: e2eAuth } = await import("./config");

    expect(e2eAuth.options.rateLimit).toMatchObject({
      enabled: false,
      storage: "database",
    });
  });

  test.each([
    [
      "the flag on a test server",
      true,
      { E2E_DISABLE_AUTH_RATE_LIMIT: "true" },
    ],
    [
      "the flag on a preview deploy",
      true,
      { E2E_DISABLE_AUTH_RATE_LIMIT: "true", VERCEL_ENV: "preview" },
    ],
    [
      "the flag on a production deploy",
      false,
      { E2E_DISABLE_AUTH_RATE_LIMIT: "true", VERCEL_ENV: "production" },
    ],
    [
      "a flag that is not exactly true",
      false,
      { E2E_DISABLE_AUTH_RATE_LIMIT: "1" },
    ],
    ["no flag", false, {}],
  ])("%s turns the limiter off: %s", (_case, disabled, env) => {
    expect(isAuthRateLimitDisabled(env)).toBe(disabled);
  });

  test("caches the session in a signed cookie for five minutes", () => {
    expect(auth.options.session?.cookieCache).toEqual({
      enabled: true,
      maxAge: 300,
    });
  });

  test("takes its URL from BETTER_AUTH_URL and trusts exactly the origins derived from it", () => {
    const { baseURL, trustedOrigins } = auth.options;

    // `vitest.config.ts` sets BETTER_AUTH_URL.
    expect(baseURL).toBe("http://localhost:3000");
    expect(trustedOrigins).toEqual(getTrustedOrigins("http://localhost:3000"));
  });
});
