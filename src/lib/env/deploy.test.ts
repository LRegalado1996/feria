import { afterEach, describe, expect, test, vi } from "vitest";

import {
  detectStableEnvironment,
  isProductionDeploy,
  isVercelPreviewDeploy,
  readClientDeployEnv,
} from "./deploy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isProductionDeploy", () => {
  test("is true only when Vercel says production", () => {
    expect(isProductionDeploy({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionDeploy({ VERCEL_ENV: "preview" })).toBe(false);
  });

  test("ignores NODE_ENV, which every build sets to production", () => {
    expect(isProductionDeploy({ NODE_ENV: "production" })).toBe(false);
  });

  test("reads process.env by default", () => {
    vi.stubEnv("VERCEL_ENV", "production");

    expect(isProductionDeploy()).toBe(true);
  });
});

describe("isVercelPreviewDeploy", () => {
  test.each([
    [{ VERCEL: "1", VERCEL_ENV: "preview" }, true],
    [{ VERCEL_ENV: "preview" }, false],
    [{ VERCEL: "1", VERCEL_ENV: "production" }, false],
  ])("needs both VERCEL=1 and VERCEL_ENV=preview: %j is %s", (env, preview) => {
    expect(isVercelPreviewDeploy(env)).toBe(preview);
  });

  test("reads process.env by default", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(isVercelPreviewDeploy()).toBe(true);
  });
});

describe("detectStableEnvironment", () => {
  test("names production and qa from the target environment", () => {
    expect(detectStableEnvironment({ VERCEL_TARGET_ENV: "production" })).toBe(
      "production"
    );
    expect(detectStableEnvironment({ VERCEL_TARGET_ENV: "qa" })).toBe("qa");
  });

  test("falls back to the branch when the target is the generic preview", () => {
    expect(
      detectStableEnvironment({
        VERCEL_TARGET_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "qa",
      })
    ).toBe("qa");
  });

  test("returns null for any other branch", () => {
    expect(
      detectStableEnvironment({
        VERCEL_TARGET_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "feat/qa-dashboard",
      })
    ).toBeNull();
  });

  test("reads process.env by default", () => {
    vi.stubEnv("VERCEL_TARGET_ENV", "production");

    expect(detectStableEnvironment()).toBe("production");
  });
});

describe("readClientDeployEnv", () => {
  test("maps the inlined NEXT_PUBLIC_ copies back to Vercel's names", () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL", "1");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF", "qa");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_TARGET_ENV", "preview");

    expect(readClientDeployEnv()).toEqual({
      NODE_ENV: "test",
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "qa",
      VERCEL_TARGET_ENV: "preview",
    });
  });
});
