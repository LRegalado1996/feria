import { describe, expect, test, vi } from "vitest";

import robots from "./robots";

const DISALLOWED = [
  "/admin",
  "/en/admin",
  "/api",
  "/coming-soon",
  "/en/coming-soon",
];

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
});
