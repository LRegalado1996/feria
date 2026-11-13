import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import "./src/env.js";

// ── Security headers ─────────────────────────────────────────────────────────
// Here and not in vercel.json, so a standalone or Docker build sends them too.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const config: NextConfig = {
  // ── Output ─────────────────────────────────────────────────────────────────
  // Vercel's adapter packages the app itself; standalone is for the CI e2e
  // runtime, which boots `.next/standalone/server.js` directly.
  ...(process.env.VERCEL === "1" ? {} : { output: "standalone" }),

  reactStrictMode: true,
  allowedDevOrigins: ["*.feria.localhost"],

  // ── Rendering (docs/agents/nextjs.md) ──────────────────────────────────────
  // Dynamic by default: a request-time read (session, headers, cookies, the
  // clock) sits under <Suspense> or behind `use cache`, and Next prerenders the
  // rest into a static shell that a <Link> prefetches ahead of the click.
  cacheComponents: true,
  partialPrefetching: true,
  // Automatic memoization. A component that reads a library's mutable instance
  // during render (TanStack Table) opts out with "use no memo".
  reactCompiler: true,
  experimental: {
    // The compiler as native code inside Turbopack, so no Babel plugin is
    // installed. Throws unless `reactCompiler` is on, and under webpack.
    turbopackRustReactCompiler: true,
  },

  headers: async () =>
    await Promise.resolve([{ source: "/(.*)", headers: SECURITY_HEADERS }]),

  // Vercel gives these to the server only. The browser needs them to resolve
  // its Sentry environment (src/lib/env/deploy.ts `readClientDeployEnv`): the
  // branch is what tells qa apart from a throwaway preview.
  env: {
    NEXT_PUBLIC_VERCEL: process.env.VERCEL ?? "",
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF ?? "",
    NEXT_PUBLIC_VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV ?? "",
  },
};

// Inert without a DSN at runtime. Source maps upload only with
// SENTRY_AUTH_TOKEN (plus SENTRY_ORG and SENTRY_PROJECT), so a local build
// needs no Sentry credentials.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Browser events go through this app's own origin, past ad blockers.
  tunnelRoute: "/monitoring",
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // `next build` is Turbopack, where every `webpack.*` option is inert. These
  // are the Turbopack spellings; re-check them on a @sentry/nextjs bump.
  _experimental: {
    // A check-in monitor per vercel.json cron, so a dead cron is an alert
    // rather than silence.
    vercelCronsMonitoring: true,
    // Replay and breadcrumbs name the React component, not a minified path.
    turbopackReactComponentAnnotation: { enabled: true },
  },
});
