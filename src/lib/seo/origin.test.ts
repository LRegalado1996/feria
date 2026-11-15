import { describe, expect, test, vi } from "vitest";

import { absoluteUrl, siteOrigin } from "./origin";

describe("siteOrigin", () => {
  test("is the configured auth URL's origin, without its path", () => {
    expect(
      siteOrigin({
        BETTER_AUTH_URL: "https://feria.example/api/auth",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "deployment.example",
      })
    ).toBe("https://feria.example");
  });

  test.each([
    ["empty", ""],
    ["unset", undefined],
  ])(
    "falls back to the deployment's own URL, read from the same env, when the auth URL is %s",
    (_case, configured) => {
      expect(
        siteOrigin({
          BETTER_AUTH_URL: configured,
          VERCEL_ENV: "production",
          VERCEL_PROJECT_PRODUCTION_URL: "deployment.example",
        })
      ).toBe("https://deployment.example");
    }
  );

  test("reads the process's env when given none", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://from-process.example/");

    expect(siteOrigin()).toBe("https://from-process.example");
  });
});

describe("absoluteUrl", () => {
  test.each([
    [
      "a site path",
      "/lr-market/products/cadena",
      "https://feria.example/lr-market/products/cadena",
    ],
    ["an English path", "/en/lr-market", "https://feria.example/en/lr-market"],
    [
      "an absolute URL, kept as it is",
      "https://cdn.example/photo.webp",
      "https://cdn.example/photo.webp",
    ],
  ])("resolves %s against the origin", (_case, path, expected) => {
    expect(absoluteUrl(path, "https://feria.example")).toBe(expected);
  });

  test("resolves against the site's origin when given none", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://from-process.example");

    expect(absoluteUrl("/lr-market")).toBe(
      "https://from-process.example/lr-market"
    );
  });
});
