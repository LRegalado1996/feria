import { describe, expect, test } from "vitest";

import { localizePath } from "@/lib/i18n/paths";

import { CHECKOUT_PATH, isPlainClick, isSamePage } from "./paths";

/** A click with nothing held, made of the parts a test changes. */
function makeClick(overrides: Partial<Parameters<typeof isPlainClick>[0]>) {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

/** Where the browser is, as `window.location` says it. */
function makeLocation(href: string) {
  const url = new URL(href);

  return {
    href: url.href,
    origin: url.origin,
    pathname: url.pathname,
    search: url.search,
  };
}

describe("CHECKOUT_PATH", () => {
  test.each([
    ["es", "/cart"],
    ["en", "/en/cart"],
  ] as const)("is %s's %s", (locale, href) => {
    expect(localizePath(CHECKOUT_PATH, locale)).toBe(href);
  });
});

describe("isPlainClick", () => {
  test("a click with the main button and nothing held is plain", () => {
    expect(isPlainClick(makeClick({}))).toBe(true);
  });

  test.each([
    ["the middle button", { button: 1 }],
    ["Alt", { altKey: true }],
    ["Control", { ctrlKey: true }],
    ["Command", { metaKey: true }],
    ["Shift", { shiftKey: true }],
  ])("a click with %s opens elsewhere", (_case, overrides) => {
    expect(isPlainClick(makeClick(overrides))).toBe(false);
  });
});

describe("isSamePage", () => {
  test.each([
    ["the same path", "/en/cart", true],
    ["the same full address", "https://shop.example/en/cart", true],
    ["another path", "/cart", false],
    ["the same path with a query", "/en/cart?step=2", false],
    ["another host", "https://other.example/en/cart", false],
  ])("a link to %s is %s", (_case, href, same) => {
    expect(isSamePage(href, makeLocation("https://shop.example/en/cart"))).toBe(
      same
    );
  });

  test("a page with a query is the same only with that query", () => {
    const current = makeLocation("https://shop.example/productos?color=oro");

    expect(isSamePage("/productos?color=oro", current)).toBe(true);
    expect(isSamePage("/productos", current)).toBe(false);
  });
});
