import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

import { resolveDatabaseUrl } from "./env-database-url.js";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    BETTER_AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    // Unset: Better Auth derives its base URL from the deployment's own URL
    // (`getBaseUrl`), which is what a preview needs. Production and qa pin
    // theirs in Vercel; local runs get it from `pnpm wt:provision`.
    BETTER_AUTH_URL: z.url().optional(),
    DATABASE_URL: z.url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // Observability (docs/agents/observability.md). Build-time only: source
    // map upload, skipped without the token.
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    // Unset: /api/health is public. Set: callers present it (bearer or ?secret=).
    HEALTH_SECRET: z.string().min(16).optional(),
    // Vercel Blob (article, banner and logo images). Production has its own
    // store; qa, previews and local runs share a second one. Optional until
    // the upload pipeline reads it (FER-011).
    BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    // Vercel AI Gateway. Deployments authenticate with the OIDC token Vercel
    // injects (`VERCEL_OIDC_TOKEN`, refreshed locally by `vercel env pull`),
    // so a key is only for a machine without one.
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // Unset: Sentry stays off and every capture helper returns null.
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    // Production and qa read their own variable once Neon gives every
    // preview a branch: src/env-database-url.js.
    DATABASE_URL: resolveDatabaseUrl(process.env),
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    HEALTH_SECRET: process.env.HEALTH_SECRET,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
