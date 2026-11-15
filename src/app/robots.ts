import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/seo/origin";

/**
 * Never worth crawling: the admin, the API and the coming-soon page, in
 * every language they answer in. A rule is a prefix, and a store's address
 * may start like one of these (`/apio`, `/administracion`), so each root is
 * anchored with `$`, its query (`/admin?next=…`) matched by its `?`, and
 * only the paths under it by its slash.
 */
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

/**
 * The search and assistant crawlers, named so the intent survives a future
 * rule for `*`. A crawler named in a group reads only that group, so each
 * one repeats the disallowed paths. Tokens as the vendors document them
 * (OpenAI, Anthropic, Perplexity, Google, Apple, Common Crawl), checked
 * November 2026.
 */
const AI_CRAWLERS = [
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
];

/** `robots.txt` (FER-024): everyone welcome to the storefront, and the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { allow: "/", disallow: DISALLOWED, userAgent: "*" },
      { allow: "/", disallow: DISALLOWED, userAgent: AI_CRAWLERS },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
