/**
 * Which deployment this process is, from Vercel's system variables.
 *
 * Never from `NODE_ENV`: it is `production` in every preview, on `qa` and in
 * every local `next build`. Each helper takes the environment as a parameter so
 * the browser can pass {@linkcode readClientDeployEnv} instead.
 */
type DeployEnv = Record<string, string | undefined>;

/** The live production deployment, and nothing else. */
export function isProductionDeploy(env: DeployEnv = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

/**
 * A real Vercel preview. `VERCEL === "1"` is required too: a harness that
 * fakes `VERCEL_ENV` to reach preview-only behaviour is not a deployment.
 */
export function isVercelPreviewDeploy(env: DeployEnv = process.env): boolean {
  return env.VERCEL === "1" && env.VERCEL_ENV === "preview";
}

/**
 * `production` or `qa` for the long-lived deployments, `null` otherwise. One
 * definition, shared with the database-URL resolver that picks the same
 * environment.
 */
export { detectStableEnvironment } from "@/env-database-url";

/**
 * The browser's view of the variables above. Vercel exposes them to the server
 * only, so `next.config.ts` inlines them under `NEXT_PUBLIC_*`. Each read stays
 * a literal `process.env.NEXT_PUBLIC_X`: the only form Next replaces at build.
 */
export function readClientDeployEnv(): DeployEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.NEXT_PUBLIC_VERCEL,
    VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    VERCEL_GIT_COMMIT_REF: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF,
    VERCEL_TARGET_ENV: process.env.NEXT_PUBLIC_VERCEL_TARGET_ENV,
  };
}
