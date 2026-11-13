import { describe, expect, test } from "vitest";

import {
  detectStableEnvironment,
  resolveDatabaseUrl,
} from "./env-database-url.js";

describe("detectStableEnvironment", () => {
  test.each([
    [
      "the Vercel target environment",
      { VERCEL_TARGET_ENV: "production" },
      "production",
    ],
    [
      "the target environment over the branch",
      { VERCEL_TARGET_ENV: "qa", VERCEL_GIT_COMMIT_REF: "main" },
      "qa",
    ],
    [
      "the main branch as production",
      { VERCEL_TARGET_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" },
      "production",
    ],
    [
      "the branch of a preview deployment",
      { VERCEL_TARGET_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" },
      "qa",
    ],
  ])("reads %s", (_case, env, expected) => {
    expect(detectStableEnvironment(env)).toBe(expected);
  });

  test.each([
    [
      "a feature preview",
      { VERCEL_TARGET_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/qa" },
    ],
    [
      "a branch that only shares an environment's name",
      { VERCEL_TARGET_ENV: "preview", VERCEL_GIT_COMMIT_REF: "production" },
    ],
    ["a target named after the branch", { VERCEL_TARGET_ENV: "main" }],
    ["a local run", { VERCEL_TARGET_ENV: "development" }],
    ["CI", {}],
  ])("is null for %s", (_case, env) => {
    expect(detectStableEnvironment(env)).toBeNull();
  });
});

const DEDICATED_URLS = {
  PRODUCTION_DATABASE_URL: "postgres://production",
  QA_DATABASE_URL: "postgres://qa",
  DATABASE_URL: "postgres://preview-branch",
};

describe("resolveDatabaseUrl", () => {
  test.each([
    [
      "production",
      { VERCEL_TARGET_ENV: "production", NEON_PREVIEW_BRANCHES: "1" },
      "postgres://production",
    ],
    ["qa", { VERCEL_GIT_COMMIT_REF: "qa" }, "postgres://qa"],
  ])(
    "gives %s its dedicated URL, never DATABASE_URL",
    (_case, env, expected) => {
      expect(resolveDatabaseUrl({ ...DEDICATED_URLS, ...env })).toBe(expected);
    }
  );

  test.each([undefined, "", "0", "true"])(
    "falls back to DATABASE_URL while NEON_PREVIEW_BRANCHES is %j",
    (flag) => {
      expect(
        resolveDatabaseUrl({
          VERCEL_TARGET_ENV: "production",
          DATABASE_URL: "postgres://shared",
          NEON_PREVIEW_BRANCHES: flag,
        })
      ).toBe("postgres://shared");
    }
  );

  test.each([
    [{ VERCEL_TARGET_ENV: "production" }, "PRODUCTION_DATABASE_URL"],
    [{ VERCEL_GIT_COMMIT_REF: "qa" }, "QA_DATABASE_URL"],
    [{ VERCEL_TARGET_ENV: "qa", QA_DATABASE_URL: "" }, "QA_DATABASE_URL"],
  ])(
    "fails closed on %j without %s once the integration is declared",
    (env, name) => {
      expect(() =>
        resolveDatabaseUrl({
          ...env,
          DATABASE_URL: "postgres://preview-branch",
          NEON_PREVIEW_BRANCHES: "1",
        })
      ).toThrow(`${name} is required`);
    }
  );

  test("gives a feature preview DATABASE_URL", () => {
    expect(
      resolveDatabaseUrl({
        ...DEDICATED_URLS,
        VERCEL_TARGET_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "feature/x",
        NEON_PREVIEW_BRANCHES: "1",
      })
    ).toBe("postgres://preview-branch");
  });

  test("gives an empty URL when nothing is set", () => {
    expect(resolveDatabaseUrl({})).toBe("");
  });

  test("reads process.env by default", () => {
    // `vitest.config.ts` sets DATABASE_URL, and no test runs as a Vercel deploy.
    expect(resolveDatabaseUrl()).toBe("postgresql://localhost:5432/stub");
  });
});
