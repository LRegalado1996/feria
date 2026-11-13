import { describe, expect, test } from "vitest";

import { getTrustedOrigins } from "./trusted-origins";

const VERCEL_PREVIEW = {
  VERCEL_URL: "my-app-abc123-team.vercel.app",
  VERCEL_BRANCH_URL: "my-app-git-feature-team.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "my-app.example.com",
};

describe("getTrustedOrigins", () => {
  test("production trusts its base URL and this deployment's own URLs, nothing else", () => {
    expect(
      getTrustedOrigins("https://my-app-git-feature-team.vercel.app", {
        NODE_ENV: "production",
        ...VERCEL_PREVIEW,
      })
    ).toEqual([
      "https://my-app-git-feature-team.vercel.app",
      "https://my-app-abc123-team.vercel.app",
      "https://my-app.example.com",
    ]);
  });

  test("production off Vercel trusts its base URL alone", () => {
    expect(
      getTrustedOrigins("https://app.example.com", { NODE_ENV: "production" })
    ).toEqual(["https://app.example.com"]);
  });

  test.each(["development", "test", undefined])(
    "NODE_ENV %s also trusts the local development origins",
    (nodeEnv) => {
      expect(
        getTrustedOrigins("http://localhost:3000", { NODE_ENV: nodeEnv })
      ).toEqual([
        "http://localhost:3000",
        "http://localhost:*",
        "https://feria.localhost",
        "https://*.feria.localhost",
      ]);
    }
  );

  test("skips a Vercel variable that is set but empty", () => {
    expect(
      getTrustedOrigins("https://app.example.com", {
        NODE_ENV: "production",
        VERCEL_URL: "",
        VERCEL_BRANCH_URL: "app-git-main-team.vercel.app",
      })
    ).toEqual([
      "https://app.example.com",
      "https://app-git-main-team.vercel.app",
    ]);
  });
});
