import { describe, expect, test } from "vitest";

import {
  COMING_SOON_PATH,
  isStorefrontLaunched,
  isStorefrontLaunchedFor,
  LAUNCH_OVERRIDE_HEADER,
} from "./launch";

const PRODUCTION = { VERCEL: "1", VERCEL_ENV: "production" };

describe("isStorefrontLaunched", () => {
  test.each([
    ["a local run", {}],
    ["a preview", { VERCEL: "1", VERCEL_ENV: "preview" }],
    ["qa", { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }],
  ])("is open on %s when the variable is unset", (_name, env) => {
    expect(isStorefrontLaunched(env)).toBe(true);
  });

  test.each([
    ["the production deployment", PRODUCTION],
    ["a build of main", { VERCEL_GIT_COMMIT_REF: "main" }],
    ["the production target", { VERCEL_TARGET_ENV: "production" }],
  ])("is closed on %s when the variable is unset", (_name, env) => {
    expect(isStorefrontLaunched(env)).toBe(false);
  });

  test("launch day: true opens production", () => {
    expect(
      isStorefrontLaunched({ ...PRODUCTION, STOREFRONT_LAUNCHED: "true" })
    ).toBe(true);
  });

  test("false closes an environment that would be open", () => {
    expect(isStorefrontLaunched({ STOREFRONT_LAUNCHED: "false" })).toBe(false);
  });

  test.each(["", "1", "TRUE", "yes"])(
    "treats %j as unset: only true and false decide",
    (value) => {
      expect(isStorefrontLaunched({ STOREFRONT_LAUNCHED: value })).toBe(true);
      expect(
        isStorefrontLaunched({ ...PRODUCTION, STOREFRONT_LAUNCHED: value })
      ).toBe(false);
    }
  );
});

describe("isStorefrontLaunchedFor", () => {
  const E2E = { E2E_STOREFRONT_LAUNCH_OVERRIDE: "true" };

  test("lets a browser test close an open server, and open a closed one, for its own request", () => {
    expect(isStorefrontLaunchedFor("false", E2E)).toBe(false);
    expect(
      isStorefrontLaunchedFor("true", { ...E2E, STOREFRONT_LAUNCHED: "false" })
    ).toBe(true);
  });

  test.each([null, "", "1", "maybe"])(
    "falls back to the environment when the header is %j",
    (override) => {
      expect(isStorefrontLaunchedFor(override, E2E)).toBe(true);
      expect(
        isStorefrontLaunchedFor(override, {
          ...E2E,
          STOREFRONT_LAUNCHED: "false",
        })
      ).toBe(false);
    }
  );

  test("ignores the header on a server that did not opt in", () => {
    expect(isStorefrontLaunchedFor("false", {})).toBe(true);
    expect(
      isStorefrontLaunchedFor("false", {
        E2E_STOREFRONT_LAUNCH_OVERRIDE: "1",
      })
    ).toBe(true);
  });

  test("never lets a header open production, even if the opt-in is set there", () => {
    expect(isStorefrontLaunchedFor("true", { ...PRODUCTION, ...E2E })).toBe(
      false
    );
  });
});

describe("launch constants", () => {
  test("name the closed page's path and the test header", () => {
    expect(COMING_SOON_PATH).toBe("/coming-soon");
    expect(LAUNCH_OVERRIDE_HEADER).toBe("x-e2e-storefront-launched");
  });
});
