import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  answerAddress,
  decidesAddress,
  OWN_ROUTES,
  type StoreAddresses,
  UNKNOWN_ADDRESS_PATH,
} from "./store-address";

/** A store with a group and its category, a loose category and three pages. */
function makeAddresses(
  overrides: Partial<StoreAddresses> = {}
): StoreAddresses {
  return {
    categories: [
      { path: "/bijouterie", slug: "bijouterie" },
      { path: "/bijouterie/anillos", slug: "anillos" },
      { path: "/burbujeros", slug: "burbujeros" },
    ],
    pages: [
      { isHome: true, isPublished: true, slug: "home" },
      { isHome: false, isPublished: true, slug: "regalos" },
      { isHome: false, isPublished: false, slug: "ofertas" },
    ],
    ...overrides,
  };
}

/** Files that make a folder of `src/app` an address. */
const ROUTE_FILES = new Set(["page.tsx", "route.ts"]);

/**
 * Every address pattern of `src/app/[locale]` (`*` for a dynamic or
 * catch-all segment), route groups left out: its pages, its route
 * handlers and its share cards.
 */
function appRoutes(): string[] {
  const routes: string[] = [];

  function walk(directory: string, segments: string[]) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const { name } = entry;

      if (entry.isDirectory()) {
        const grouped = name.startsWith("(");
        const segment = name.startsWith("[") ? "*" : name;
        walk(
          path.join(directory, name),
          grouped ? segments : [...segments, segment]
        );
      } else if (ROUTE_FILES.has(name)) {
        routes.push(`/${segments.join("/")}`);
      } else if (name === "opengraph-image.tsx") {
        routes.push(`/${[...segments, "opengraph-image"].join("/")}`);
      }
    }
  }

  walk(path.join(process.cwd(), "src", "app", "[locale]"), []);

  return routes;
}

/** Whether `pattern` answers `route`, both with `*` for any one segment. */
function covers(pattern: string, route: string) {
  const parts = pattern.split("/");
  const asked = route.split("/");

  return (
    parts.length === asked.length &&
    parts.every((part, index) => part === "*" || part === asked[index])
  );
}

describe("OWN_ROUTES", () => {
  // `[group]`, `[group]/[category]` and the catch-all `[...rest]` are the
  // addresses the proxy decides for; the home is never one.
  const routes = appRoutes().filter(
    (route) =>
      route !== "/" && route.split("/").length <= 3 && !route.startsWith("/*")
  );

  test("covers every route of one or two segments of the app but the store's catalog and pages", () => {
    expect(routes).toContain("/contacto");
    expect(
      routes.filter((route) => !OWN_ROUTES.some((own) => covers(own, route)))
    ).toEqual([]);
  });

  test("names only routes the app has", () => {
    expect(OWN_ROUTES.filter((own) => !routes.includes(own))).toEqual([]);
  });
});

describe("UNKNOWN_ADDRESS_PATH", () => {
  test("has three segments, one more than any address the proxy decides, so only the catch-all can answer it", () => {
    expect(UNKNOWN_ADDRESS_PATH.slice(1).split("/")).toHaveLength(3);
    expect(decidesAddress(UNKNOWN_ADDRESS_PATH)).toBe(false);
  });
});

describe("decidesAddress", () => {
  test.each([
    ["/bijouterie", true],
    ["/bijouterie/anillos", true],
    ["/no-such", true],
    // `/orders` has no page; its token's page is `/orders/{token}`.
    ["/orders", true],
    // A route of its own answers one segment only: under it, the catalog's.
    ["/contacto/x", true],
    ["/cart/x", true],
    ["/", false],
    ["/a/b/c", false],
    ["//bijouterie", false],
    ["/bijouterie//anillos", false],
    ["/bijouterie/", false],
    ["/productos", false],
    ["/productos/anillo-sello", false],
    ["/orders/abc", false],
    ["/contacto", false],
    ["/cart", false],
    ["/coming-soon", false],
    ["/design", false],
    ["/llms.txt", false],
    ["/opengraph-image", false],
    ["/admin", false],
    ["/admin/orders", false],
  ])("%s → %s", (pathname, decided) => {
    expect(decidesAddress(pathname)).toBe(decided);
  });
});

describe("answerAddress", () => {
  test.each([
    ["/bijouterie", { kind: "page" }],
    ["/bijouterie/anillos", { kind: "page" }],
    ["/burbujeros", { kind: "page" }],
    ["/regalos", { kind: "page" }],
    ["/ofertas", { kind: "draft" }],
    ["/no-such", { kind: "unknown" }],
    ["/bijouterie/no-such", { kind: "unknown" }],
    // A page is one segment only.
    ["/bijouterie/regalos", { kind: "unknown" }],
    // Slugs are exact: the route's own check refuses anything else.
    ["/Bijouterie", { kind: "unknown" }],
  ] as const)("%s is %j", (pathname, answer) => {
    expect(answerAddress(makeAddresses(), pathname)).toEqual(answer);
  });

  test.each([
    // A group's category without its group, under another one, or under
    // one it has left; and a loose category under a group.
    ["/anillos", "/bijouterie/anillos"],
    ["/burbujeros/anillos", "/bijouterie/anillos"],
    ["/bijouterie/burbujeros", "/burbujeros"],
    ["/x/bijouterie", "/bijouterie"],
  ])("%s leads permanently to %s, its query kept", (pathname, target) => {
    expect(answerAddress(makeAddresses(), pathname)).toEqual({
      keepQuery: true,
      kind: "redirect",
      path: target,
      status: 308,
    });
  });

  test("the home's own address leads to `/` for now, its query dropped", () => {
    expect(answerAddress(makeAddresses(), "/home")).toEqual({
      keepQuery: false,
      kind: "redirect",
      path: "/",
      status: 307,
    });
  });

  test("a page that stops being the home is a page at its address again", () => {
    const addresses = makeAddresses({
      pages: [
        { isHome: false, isPublished: true, slug: "home" },
        { isHome: true, isPublished: true, slug: "regalos" },
      ],
    });

    expect(answerAddress(addresses, "/home")).toEqual({ kind: "page" });
    expect(answerAddress(addresses, "/regalos")).toEqual({
      keepQuery: false,
      kind: "redirect",
      path: "/",
      status: 307,
    });
  });

  test("a page comes before a category at the same address, as the route reads them", () => {
    const addresses = makeAddresses({
      pages: [{ isHome: false, isPublished: false, slug: "anillos" }],
    });

    expect(answerAddress(addresses, "/anillos")).toEqual({ kind: "draft" });
  });

  test.each(["/", "/productos", "/a/b/c", "/admin/x"])(
    "leaves %s to its own route",
    (pathname) => {
      expect(answerAddress(makeAddresses(), pathname)).toBeNull();
    }
  );

  test("a store with no category or page knows no address", () => {
    expect(answerAddress({ categories: [], pages: [] }, "/bijouterie")).toEqual(
      { kind: "unknown" }
    );
  });
});
