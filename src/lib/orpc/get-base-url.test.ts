import { describe, expect, test } from "vitest";

import { getBaseUrl } from "./get-base-url";

describe("getBaseUrl, from the server's variables", () => {
  test.each([
    [
      "the production URL on production, over the deployment's own",
      {
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "my-app.vercel.app",
        VERCEL_BRANCH_URL: "my-app-git-qa.vercel.app",
        VERCEL_URL: "my-app-abc123.vercel.app",
      },
      "https://my-app.vercel.app",
    ],
    [
      "the branch URL on a preview, over the deployment's own",
      {
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: "my-app.vercel.app",
        VERCEL_BRANCH_URL: "my-app-git-feature.vercel.app",
        VERCEL_URL: "my-app-abc123.vercel.app",
      },
      "https://my-app-git-feature.vercel.app",
    ],
    [
      "the deployment's URL on production without a production URL",
      { VERCEL_ENV: "production", VERCEL_URL: "my-app-abc123.vercel.app" },
      "https://my-app-abc123.vercel.app",
    ],
    [
      "the deployment's URL on a preview without a branch URL",
      { VERCEL_ENV: "preview", VERCEL_URL: "my-app-abc123.vercel.app" },
      "https://my-app-abc123.vercel.app",
    ],
    [
      "the deployment's URL without VERCEL_ENV",
      { VERCEL_URL: "my-app-abc123.vercel.app" },
      "https://my-app-abc123.vercel.app",
    ],
    ["localhost on port 3000 off Vercel", {}, "http://localhost:3000"],
    ["localhost on PORT when set", { PORT: "4000" }, "http://localhost:4000"],
  ])("returns %s", (_case, env, expected) => {
    expect(getBaseUrl(false, env)).toBe(expected);
  });
});

describe("getBaseUrl, from the NEXT_PUBLIC_ copies", () => {
  test.each([
    [
      "the production URL on production",
      {
        NEXT_PUBLIC_VERCEL_ENV: "production",
        NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: "public-app.vercel.app",
      },
      "https://public-app.vercel.app",
    ],
    [
      "the branch URL on a preview",
      {
        NEXT_PUBLIC_VERCEL_ENV: "preview",
        NEXT_PUBLIC_VERCEL_BRANCH_URL: "public-app-git-feature.vercel.app",
      },
      "https://public-app-git-feature.vercel.app",
    ],
    [
      "the deployment's URL when the specific one is missing",
      {
        NEXT_PUBLIC_VERCEL_ENV: "production",
        NEXT_PUBLIC_VERCEL_URL: "public-app-abc123.vercel.app",
      },
      "https://public-app-abc123.vercel.app",
    ],
    [
      "localhost, ignoring the server's own variables",
      {
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "my-app.vercel.app",
      },
      "http://localhost:3000",
    ],
  ])("returns %s", (_case, env, expected) => {
    expect(getBaseUrl(true, env)).toBe(expected);
  });
});
