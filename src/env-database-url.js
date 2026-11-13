/**
 * The database URL for this deployment.
 *
 * With the Vercel–Neon integration, every preview deployment gets its own Neon
 * branch, and the integration writes that branch's `DATABASE_URL` into the
 * Preview environment. The long-lived environments (production, qa) therefore
 * read dedicated variables the integration never writes:
 * `PRODUCTION_DATABASE_URL` and `QA_DATABASE_URL`. Previews, local runs and CI
 * read `DATABASE_URL`. Setup: docs/agents/database.md § Preview databases.
 *
 * Plain JS: `src/env.js` imports it, and next.config.js loads that in plain Node.
 */

/** @typedef {Record<string, string | undefined>} ProcessEnv */

/**
 * The long-lived environment this process belongs to, from the Vercel target
 * (production, or a custom `qa` environment) or else the git branch (`qa`
 * deployed as a branch preview, `main` for production). `null` for previews,
 * local runs and CI.
 *
 * @param {ProcessEnv} [processEnv] the environment to read, `process.env` by default
 * @returns {"production" | "qa" | null} the long-lived environment, if any
 */
export function detectStableEnvironment(processEnv = process.env) {
  const target = processEnv.VERCEL_TARGET_ENV;
  if (target === "production" || target === "qa") {
    return target;
  }

  // Branch names, not environment names: production deploys from `main`.
  const branch = processEnv.VERCEL_GIT_COMMIT_REF;
  if (branch === "main") {
    return "production";
  }
  if (branch === "qa") {
    return "qa";
  }

  return null;
}

/**
 * The connection string this process opens.
 *
 * A long-lived environment without its dedicated variable falls back to
 * `DATABASE_URL`, which is how every deployment worked before the integration.
 * Once `NEON_PREVIEW_BRANCHES=1` says the integration is installed, that
 * fallback could be a preview branch's database, so it fails closed instead.
 *
 * @param {ProcessEnv} [processEnv] the environment to read, `process.env` by default
 * @returns {string} the URL, empty when nothing is configured
 */
export function resolveDatabaseUrl(processEnv = process.env) {
  const name = detectStableEnvironment(processEnv);

  if (name) {
    // Explicit reads, no computed key, so a bundler can still see them.
    const dedicated =
      name === "production"
        ? processEnv.PRODUCTION_DATABASE_URL
        : processEnv.QA_DATABASE_URL;

    if (dedicated) {
      return dedicated;
    }

    if (processEnv.NEON_PREVIEW_BRANCHES === "1") {
      throw new Error(
        `${name.toUpperCase()}_DATABASE_URL is required in the "${name}" environment once NEON_PREVIEW_BRANCHES=1: DATABASE_URL may be a preview branch's database.`
      );
    }
  }

  return processEnv.DATABASE_URL ?? "";
}
