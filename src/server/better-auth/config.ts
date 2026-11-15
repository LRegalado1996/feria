import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { getBaseUrl } from "@/lib/orpc/get-base-url";
import { USER_ROLES } from "@/lib/schemas/access";
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
    // Closed sign-up (FER-009): logins are created by a superadmin or a store
    // member through `createAccount`, never by a visitor. The HTTP route is
    // also answered 404 (`src/app/api/auth/[...all]/route.ts`).
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      // Read onto the session so pages can route by it; never taken from a
      // request. Procedures re-read it from the database before trusting it.
      role: {
        type: [...USER_ROLES],
        required: true,
        defaultValue: "member",
        input: false,
      },
    },
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
      // Five tries a minute per IP: enough for a mistyped password on a
      // phone, too few to guess one.
      "/sign-in/email": {
        window: 60,
        max: 5,
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
