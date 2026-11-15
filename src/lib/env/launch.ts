import { detectStableEnvironment, isProductionDeploy } from "./deploy";

type LaunchEnv = Record<string, string | undefined>;

/** Where every storefront address leads while the store is closed. */
export const COMING_SOON_PATH = "/coming-soon";

/**
 * The request header a browser test sets to see the other position of the
 * switch on the one server it runs against.
 */
export const LAUNCH_OVERRIDE_HEADER = "x-e2e-storefront-launched";

/** Production by either sign: the Vercel environment, or the branch and target. */
function isProduction(env: LaunchEnv): boolean {
  return (
    isProductionDeploy(env) || detectStableEnvironment(env) === "production"
  );
}

/**
 * Whether the storefront is open to the public (FER-034).
 *
 * `STOREFRONT_LAUNCHED` decides when it is set. Unset, production is closed
 * and everything else is open, so a new production deployment can never open
 * the store by accident: launch day is setting the variable to `true` there
 * and redeploying.
 */
export function isStorefrontLaunched(env: LaunchEnv = process.env): boolean {
  if (env.STOREFRONT_LAUNCHED === "true") {
    return true;
  }

  if (env.STOREFRONT_LAUNCHED === "false") {
    return false;
  }

  return !isProduction(env);
}

/**
 * The switch for one request. Only the server Playwright starts sets
 * `E2E_STOREFRONT_LAUNCH_OVERRIDE`, and production ignores it even if
 * someone sets it, by the same definition of production that closes the
 * store: there, a visitor's header never opens it.
 */
export function isStorefrontLaunchedFor(
  override: string | null,
  env: LaunchEnv = process.env
): boolean {
  const honoured =
    env.E2E_STOREFRONT_LAUNCH_OVERRIDE === "true" && !isProduction(env);

  if (honoured && (override === "true" || override === "false")) {
    return override === "true";
  }

  return isStorefrontLaunched(env);
}
