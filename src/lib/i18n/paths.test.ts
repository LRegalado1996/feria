import { describe, expect, test } from "vitest";

import { localizePath, splitLocale } from "./paths";

describe("splitLocale", () => {
  test.each([
    ["/en", { locale: "en", pathname: "/" }],
    ["/en/", { locale: "en", pathname: "/" }],
    ["/en/cart", { locale: "en", pathname: "/cart" }],
    ["/en/products/chain-1", { locale: "en", pathname: "/products/chain-1" }],
    ["/es", { locale: "es", pathname: "/" }],
    ["/es/cart", { locale: "es", pathname: "/cart" }],
    // Never a protocol-relative path, which a browser reads as another host.
    ["/es//evil.example/x", { locale: "es", pathname: "/evil.example/x" }],
    ["/en///evil.example", { locale: "en", pathname: "/evil.example" }],
  ])("takes the locale off %j", (pathname, expected) => {
    expect(splitLocale(pathname)).toEqual(expected);
  });

  test.each([
    "/",
    "/cart",
    // Only a whole first segment is a locale.
    "/english",
    "/es-UY/cart",
    "/cart/en",
    // The URL is case-sensitive: `/EN` is a page that does not exist.
    "/EN",
    "",
  ])("leaves %j as it is: it has no locale prefix", (pathname) => {
    expect(splitLocale(pathname)).toEqual({ locale: null, pathname });
  });
});

describe("localizePath", () => {
  test.each([
    ["/", "es", "/"],
    ["/", "en", "/en"],
    ["/cart", "es", "/cart"],
    ["/cart", "en", "/en/cart"],
    // Swapping the prefix of a path that already has one.
    ["/en", "es", "/"],
    ["/en/", "es", "/"],
    ["/en/cart", "es", "/cart"],
    ["/es/cart", "en", "/en/cart"],
    ["/es", "en", "/en"],
    // Idempotent on a path already in the target language.
    ["/en/cart", "en", "/en/cart"],
    ["/en", "en", "/en"],
    ["/es/cart", "es", "/cart"],
    // A lookalike segment is part of the path, not a prefix.
    ["/english", "en", "/en/english"],
    // Whatever it is given, the result is a path on this origin.
    ["//evil.example", "es", "/evil.example"],
    ["//evil.example", "en", "/en/evil.example"],
    ["/en//evil.example", "es", "/evil.example"],
    ["/es//evil.example", "en", "/en/evil.example"],
  ] as const)("%j in %s is %j", (pathname, locale, expected) => {
    expect(localizePath(pathname, locale)).toBe(expected);
  });
});
