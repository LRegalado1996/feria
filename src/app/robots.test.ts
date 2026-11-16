import type { MetadataRoute } from "next";
import { describe, expect, test, vi } from "vitest";

import robots from "./robots";

const DISALLOWED = [
  "/admin$",
  "/admin?",
  "/admin/",
  "/en/admin$",
  "/en/admin?",
  "/en/admin/",
  "/api/",
  "/coming-soon$",
  "/coming-soon?",
  "/en/coming-soon$",
  "/en/coming-soon?",
];

type Rule = Extract<MetadataRoute.Robots["rules"], { userAgent?: unknown }>;

const asList = (value: string | string[] | undefined) =>
  value === undefined ? [] : [value].flat();

/**
 * Whether a crawler may fetch `path` under `rule`, read as Google documents
 * it: a rule is a prefix, `$` ends it, and the longest matching rule wins.
 */
function allowed(path: string, rule: Rule) {
  const longest = (patterns: string[]) =>
    Math.max(
      -1,
      ...patterns
        .filter((pattern) =>
          pattern.endsWith("$")
            ? path === pattern.slice(0, -1)
            : path.startsWith(pattern)
        )
        .map((pattern) => pattern.length)
    );

  return longest(asList(rule.allow)) >= longest(asList(rule.disallow));
}

function setup() {
  vi.stubEnv("BETTER_AUTH_URL", "https://lrmarket.example");
  const everyone = [robots().rules]
    .flat()
    .find((rule) => rule.userAgent === "*");

  if (!everyone) {
    throw new Error("robots has no rule for every crawler");
  }

  return { everyone };
}

describe("robots", () => {
  test("welcomes every crawler and the AI ones by name, keeping the admin, the API and the coming-soon page out", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://lrmarket.example/some/path");

    expect(robots()).toEqual({
      rules: [
        { allow: "/", disallow: DISALLOWED, userAgent: "*" },
        // A named crawler reads only its own group: it repeats the rules.
        {
          allow: "/",
          disallow: DISALLOWED,
          userAgent: [
            "GPTBot",
            "OAI-SearchBot",
            "ChatGPT-User",
            "ClaudeBot",
            "Claude-SearchBot",
            "Claude-User",
            "PerplexityBot",
            "Perplexity-User",
            "Google-Extended",
            "Applebot-Extended",
            "CCBot",
          ],
        },
      ],
      sitemap: "https://lrmarket.example/sitemap.xml",
    });
  });

  test.each([
    "/",
    "/products",
    "/products/par-de-esclavas",
    "/en",
    "/en/products/par-de-esclavas",
    "/llms.txt",
    // An address that only starts like a closed path stays open.
    "/apio",
    "/administracion/products",
    "/en/admin-shop",
    "/coming-soon-market",
    "/administracion?ref=x",
  ])("lets crawlers read %s", (path) => {
    const { everyone } = setup();

    expect(allowed(path, everyone)).toBe(true);
  });

  test.each([
    "/admin",
    "/admin/products",
    "/en/admin",
    "/en/admin/orders",
    "/api/orpc/catalog.products",
    "/coming-soon",
    "/en/coming-soon",
    // The roots with a query, as a sign-in link or a campaign leaves them.
    "/admin?next=x",
    "/en/admin?next=x",
    "/coming-soon?utm_source=x",
    "/en/coming-soon?utm_source=x",
  ])("keeps crawlers out of %s", (path) => {
    const { everyone } = setup();

    expect(allowed(path, everyone)).toBe(false);
  });
});
