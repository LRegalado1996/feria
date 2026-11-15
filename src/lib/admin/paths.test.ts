import { describe, expect, test } from "vitest";

import {
  isPlatformSection,
  isStoreSection,
  platformSectionPath,
  safeReturnPath,
  signInPath,
  storeSectionPath,
} from "./paths";

describe("admin paths", () => {
  test.each([
    ["es", "/admin/lr-market/products"],
    ["en", "/en/admin/lr-market/products"],
  ] as const)("a store section in %s is %s", (locale, path) => {
    expect(storeSectionPath("lr-market", "products", locale)).toBe(path);
  });

  test.each([
    ["es", "/admin/platform/stores"],
    ["en", "/en/admin/platform/stores"],
  ] as const)("a platform section in %s is %s", (locale, path) => {
    expect(platformSectionPath("stores", locale)).toBe(path);
  });

  test("the sign-in page carries where to come back, encoded", () => {
    expect(signInPath("/en/admin/lr-market/orders?x=1", "en")).toBe(
      "/en/admin/sign-in?next=%2Fen%2Fadmin%2Flr-market%2Forders%3Fx%3D1"
    );
  });

  test.each([
    ["products", true],
    ["filters", true],
    ["users", true],
    ["metrics", false],
    ["", false],
  ])("%j is a store section: %s", (value, expected) => {
    expect(isStoreSection(value)).toBe(expected);
  });

  test.each([
    ["metrics", true],
    ["products", false],
  ])("%j is a platform section: %s", (value, expected) => {
    expect(isPlatformSection(value)).toBe(expected);
  });
});

describe("safeReturnPath", () => {
  test.each([
    ["/admin/lr-market/products", "/admin/lr-market/products"],
    ["/admin", "/admin"],
    [
      "/admin/lr-market/orders?status=received",
      "/admin/lr-market/orders?status=received",
    ],
  ])("goes back to the admin page %j", (next, expected) => {
    expect(safeReturnPath(next, "es")).toBe(expected);
  });

  test.each([
    ["es", "/en/admin/platform/stores", "/admin/platform/stores"],
    ["en", "/admin/platform/stores", "/en/admin/platform/stores"],
    [
      "en",
      "/en/admin/lr-market/orders?page=2",
      "/en/admin/lr-market/orders?page=2",
    ],
    ["es", "/en/admin", "/admin"],
  ] as const)(
    "on a page in %s, brings %j to that language: %j",
    (locale, next, expected) => {
      expect(safeReturnPath(next, locale)).toBe(expected);
    }
  );

  test.each([
    ["https://evil.example/admin"],
    ["//evil.example/admin"],
    ["/\\evil.example/admin"],
    ["\\\\evil.example/admin"],
    ["/admin\\..\\..\\evil"],
    ["/lr-market"],
    ["/administrator"],
    ["/admin/sign-in"],
    ["/en/admin/sign-in?next=/admin"],
    ["admin"],
    [""],
    [undefined],
    [["/admin"]],
    ["/\t/example.com:bad/admin"],
  ])("falls back to the landing for %j", (next) => {
    expect(safeReturnPath(next, "en")).toBe("/en/admin");
  });
});
