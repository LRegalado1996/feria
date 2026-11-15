import { detectStableEnvironment, isProductionDeploy } from "./deploy";

type LaunchEnv = Record<string, string | undefined>;

/** Where every storefront address leads while the store is closed. */
export const COMING_SOON_PATH = "/coming-soon";

/**
 * The request header a browser test sets to see the other position of the
 * switch on the one server it runs against.
 */
export const LAUNCH_OVERRIDE_HEADER = "x-e2e-storefront-launched";

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

  return !(
    isProductionDeploy(env) || detectStableEnvironment(env) === "production"
  );
}

/**
 * The switch for one request. Only the server Playwright starts sets
 * `E2E_STOREFRONT_LAUNCH_OVERRIDE`, and a production deploy ignores it even
 * if someone sets it: there, a visitor's header never opens the store.
 */
export function isStorefrontLaunchedFor(
  override: string | null,
  env: LaunchEnv = process.env
): boolean {
  const honoured =
    env.E2E_STOREFRONT_LAUNCH_OVERRIDE === "true" && !isProductionDeploy(env);

  if (honoured && (override === "true" || override === "false")) {
    return override === "true";
  }

  return isStorefrontLaunched(env);
}
