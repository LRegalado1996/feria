import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { getBaseUrl } from "@/lib/orpc/get-base-url";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";

import { betterAuthLogger } from "./logger";
import { getTrustedOrigins } from "./trusted-origins";

const baseURL = process.env.BETTER_AUTH_URL ?? getBaseUrl();

/**
 * Better Auth limits sign-ins per IP in a production build, the e2e server's
 * included, where every Playwright worker signs in from one machine and a
 * parallel burst answers 429. Only Playwright's `webServer.env` sets this
 * flag; it is read here and not in `src/env.js` because it is no deploy
 * setting, and a production deploy ignores it even if someone sets it.
 */
export function isAuthRateLimitDisabled(
  env: Record<string, string | undefined>
): boolean {
  return (
    env.E2E_DISABLE_AUTH_RATE_LIMIT === "true" &&
    env.VERCEL_ENV !== "production"
  );
}

export const auth = betterAuth({
  baseURL,
  trustedOrigins: getTrustedOrigins(baseURL),
  // Better Auth's default logger prints raw errors, session tokens included.
  logger: betterAuthLogger,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    // Every oRPC request resolves the session (`createORPCContext`); the
    // signed cache cookie answers that without the session and user queries.
    // `createORPCContext` forwards the renewed cookie, or the cache would only
    // cover the first minutes after sign-in.
    //
    // The price is a stale-privilege window of `maxAge`: nothing invalidates
    // this cookie when a session is revoked, or a user's role changes, from
    // somewhere else, so those requests keep authorizing for up to 5 minutes.
    // Reads that decide access on a page pass `disableCookieCache`
    // (`./server.ts`). Shorten this if the window stops being acceptable.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: {
    ...(isAuthRateLimitDisabled(process.env) ? { enabled: false } : {}),
    // Shared across instances: the default in-memory store is per serverless
    // instance, so each one would grant its own quota.
    storage: "database",
    customRules: {
      "/sign-in/email": {
        window: 10,
        max: 10,
      },
      "/sign-up/email": {
        window: 10,
        max: 10,
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
