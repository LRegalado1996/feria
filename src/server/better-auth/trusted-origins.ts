/**
 * `next dev` on any port and the worktree's portless HTTPS subdomains. Any
 * process on the visitor's machine can serve these, so production never
 * trusts them.
 */
const LOCAL_ORIGINS = [
  "http://localhost:*",
  "https://feria.localhost",
  "https://*.feria.localhost",
];

/**
 * The origins Better Auth accepts credentialed requests and redirect targets
 * from: `baseURL` (`BETTER_AUTH_URL` when set) and this deployment's own Vercel
 * URLs, which are the deployment, its branch alias and the project's
 * production domain. Exact origins only: a team-wide wildcard such as
 * `https://*-<team>.vercel.app` trusts every other project the team deploys.
 * A further domain goes in `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated),
 * which Better Auth reads itself.
 */
export function getTrustedOrigins(
  baseURL: string,
  processEnv: Record<string, string | undefined> = process.env
): string[] {
  const deploymentOrigins = [
    processEnv.VERCEL_URL,
    processEnv.VERCEL_BRANCH_URL,
    processEnv.VERCEL_PROJECT_PRODUCTION_URL,
  ].flatMap((host) => (host ? [`https://${host}`] : []));
  const localOrigins =
    processEnv.NODE_ENV === "production" ? [] : LOCAL_ORIGINS;

  return [...new Set([baseURL, ...deploymentOrigins, ...localOrigins])];
}
