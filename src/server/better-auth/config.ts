import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { getBaseUrl } from "@/lib/orpc/get-base-url";
import { USER_ROLES } from "@/lib/schemas/access";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";

import { refuseDisabledLogin } from "./disabled-login";
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
  // Closed sign-up (FER-009): also out of Better Auth's own router and the
  // OpenAPI reference. The route answers 404 for every other spelling.
  disabledPaths: ["/sign-up/email"],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    // Closed sign-up (FER-009): logins are created on the server through
    // `createAccount` (the first-run script, the seed, the users screen of
    // FER-015), never by a visitor. The HTTP route is
    // also answered 404 (`src/app/api/auth/[...all]/route.ts`).
    disableSignUp: true,
  },
  databaseHooks: {
    // A login an admin disabled cannot sign in (FER-015).
    session: { create: { before: refuseDisabledLogin(db) } },
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
    // Nothing invalidates this cookie when a session is revoked from
    // somewhere else, so the session it carries can outlive its row for up
    // to 5 minutes. Access never rests on it alone: every admin procedure
    // re-reads the login and checks the session's row in that same query
    // (`findLogin`, FER-015), and reads that decide access on a page pass
    // `disableCookieCache` (`./server.ts`).
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: {
    ...(isAuthRateLimitDisabled(process.env) ? { enabled: false } : {}),
    // Shared across instances: the default in-memory store is per serverless
    // instance, so each one would grant its own quota.
    storage: "database",
    customRules: {
      // Ten tries a minute per IP: the fair's staff can share one Wi-Fi and
      // mistype on a phone, and it is still far too few to guess a password.
      "/sign-in/email": {
        window: 60,
        max: 10,
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
