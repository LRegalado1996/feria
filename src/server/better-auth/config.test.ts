import { describe, expect, test, vi } from "vitest";

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

  test("allows 10 sign-in and 10 sign-up attempts per 10 seconds", () => {
    expect(auth.options.rateLimit?.customRules).toEqual({
      "/sign-in/email": { window: 10, max: 10 },
      "/sign-up/email": { window: 10, max: 10 },
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
