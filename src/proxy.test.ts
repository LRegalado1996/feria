import { readdirSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

import { LOCALES } from "@/lib/i18n/config";

import { config, proxy } from "./proxy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ORIGIN = "http://localhost:3000";

/** What the proxy did with a page request: the three outcomes it has. */
async function route(path: string) {
  const response = await proxy(new NextRequest(`${ORIGIN}${path}`));

  return {
    // evlog types its response by the two header methods it uses.
    status: "status" in response ? response.status : null,
    redirectedTo: response.headers.get("location"),
    rewrittenTo: response.headers.get("x-middleware-rewrite"),
    passedThrough: response.headers.get("x-middleware-next") === "1",
    requestId: response.headers.get("x-request-id"),
  };
}

describe("proxy: /api requests", () => {
  test("stamps a request id and the start time on the forwarded request and the response", async () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));

    const response = await proxy(
      new NextRequest(`${ORIGIN}/api/orpc/post/create`)
    );
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toMatch(UUID);
    expect(response.headers.get("x-middleware-request-x-request-id")).toBe(
      requestId
    );
    expect(response.headers.get("x-middleware-request-x-evlog-start")).toBe(
      "1718452800000"
    );
  });

  test("keeps the request id a caller already sent", async () => {
    const response = await proxy(
      new NextRequest(`${ORIGIN}/api/health`, {
        headers: { "x-request-id": "upstream-42" },
      })
    );

    expect(response.headers.get("x-request-id")).toBe("upstream-42");
    expect(response.headers.get("x-middleware-request-x-request-id")).toBe(
      "upstream-42"
    );
  });

  test.each([
    "/api",
    "/api/health",
    "/api/orpc/post/create",
    "/api/docs/spec.json",
  ])(
    "never gives %s a language: it is stamped and passed through as it is",
    async (path) => {
      const outcome = await route(path);

      expect(outcome).toEqual({
        status: 200,
        redirectedTo: null,
        rewrittenTo: null,
        passedThrough: true,
        requestId: expect.stringMatching(UUID),
      });
    }
  );
});

describe("proxy: page requests", () => {
  test.each([
    ["/", "/es"],
    ["/products", "/es/products"],
    ["/products/chain-1?color=dorado", "/es/products/chain-1?color=dorado"],
    // Not a locale, so it is a Spanish path like any other (and a 404 there).
    ["/english", "/es/english"],
    ["/EN", "/es/EN"],
    // `/api` is a prefix only as a whole segment.
    ["/apiary", "/es/apiary"],
  ])(
    "serves %s in Spanish by rewriting it to %s, without a request id",
    async (path, rewritten) => {
      expect(await route(path)).toEqual({
        status: 200,
        redirectedTo: null,
        rewrittenTo: `${ORIGIN}${rewritten}`,
        passedThrough: false,
        requestId: null,
      });
    }
  );

  test.each(["/en", "/en/products", "/en/products?color=dorado"])(
    "lets %s through to its English route untouched",
    async (path) => {
      expect(await route(path)).toEqual({
        status: 200,
        redirectedTo: null,
        rewrittenTo: null,
        passedThrough: true,
        requestId: null,
      });
    }
  );

  test.each([
    ["/es", "/"],
    ["/es/", "/"],
    ["/es/products", "/products"],
    ["/es/products?color=dorado&page=2", "/products?color=dorado&page=2"],
    // Not an open redirect: the target stays a path on this origin.
    ["/es//evil.example/x", "/evil.example/x"],
  ])(
    "permanently redirects %s to %s, the one address of a Spanish page",
    async (path, target) => {
      expect(await route(path)).toEqual({
        status: 308,
        redirectedTo: `${ORIGIN}${target}`,
        rewrittenTo: null,
        passedThrough: false,
        requestId: null,
      });
    }
  );
});

describe("proxy matcher", () => {
  // Next compiles each matcher to a regular expression anchored at both ends.
  const matches = (pathname: string) =>
    config.matcher.some((source) => new RegExp(`^${source}$`).test(pathname));

  test.each([
    "/",
    "/en",
    "/products/chain-1",
    "/api/health",
    "/es/cart",
    // A dot does not make a path a file.
    "/products/pulsera-2.5mm",
    "/api/docs/spec.json",
    "/robots.txt",
    // Only the tunnel itself is skipped, not a page that starts like it.
    "/monitoring-pedidos",
    // Only the generated images and the brand folder, not pages named alike.
    "/icons",
    "/iconos/anillo",
    "/opengraph-image",
    "/es/opengraph-image/extra",
    "/fr/opengraph-image",
    "/brands",
    "/en/brand/lr-market-logo.svg",
    // The template's icon is gone: the tab icon is generated (`/icon`).
    "/favicon.ico",
  ])("runs on %s", (path) => {
    expect(matches(path)).toBe(true);
  });

  test.each([
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/_vercel/insights/script.js",
    "/monitoring",
    "/monitoring/envelope",
    "/icon",
    "/apple-icon",
    "/brand/lr-market-logo.svg",
  ])("stays off %s, which has no language", (pathname) => {
    expect(matches(pathname)).toBe(false);
  });

  test("stays off the share card of every language the product speaks", () => {
    expect(
      LOCALES.map((locale) => matches(`/${locale}/opengraph-image`))
    ).toEqual(LOCALES.map(() => false));
  });

  test("stays off every file in public/, which the proxy would otherwise rewrite into a 404", () => {
    const publicFiles = readdirSync(path.join(process.cwd(), "public"), {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile())
      .map(
        (entry) =>
          `/${path.relative("public", path.join(entry.parentPath, entry.name))}`
      );

    expect(publicFiles).toContain("/brand/lr-market-logo.svg");
    expect(publicFiles.filter((file) => matches(file))).toEqual([]);
  });
});
