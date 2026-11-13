/**
 * Get the base URL for API requests based on Vercel environment
 *
 * @param usePublicEnv - Use NEXT_PUBLIC_* env vars (for client-side code)
 * @param processEnv - Environment variables object (defaults to process.env)
 */
export function getBaseUrl(
  usePublicEnv = false,
  processEnv: Record<string, string | undefined> = process.env
) {
  const env = usePublicEnv
    ? processEnv.NEXT_PUBLIC_VERCEL_ENV
    : processEnv.VERCEL_ENV;

  const productionUrl = usePublicEnv
    ? processEnv.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
    : processEnv.VERCEL_PROJECT_PRODUCTION_URL;

  const branchUrl = usePublicEnv
    ? processEnv.NEXT_PUBLIC_VERCEL_BRANCH_URL
    : processEnv.VERCEL_BRANCH_URL;

  const fallbackUrl = usePublicEnv
    ? processEnv.NEXT_PUBLIC_VERCEL_URL
    : processEnv.VERCEL_URL;

  if (env === "production" && productionUrl) {
    return `https://${productionUrl}`;
  }
  if (env === "preview" && branchUrl) {
    return `https://${branchUrl}`;
  }
  if (fallbackUrl) {
    return `https://${fallbackUrl}`;
  }

  return `http://localhost:${processEnv.PORT ?? 3000}`;
}
