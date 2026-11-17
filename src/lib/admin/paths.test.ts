import { describe, test, expect } from "vitest";

import {
  ADMIN_LANDING_SECTION,
  ADMIN_SECTIONS,
  adminSectionPath,
  isAdminSection,
  safeReturnPath,
  signInPath,
} from "./paths";

describe("admin paths", () => {
  test.each([
    ["es", "/admin/products"],
    ["en", "/en/admin/products"],
  ] as const)("a section in %s is %s, with no store in it", (locale, path) => {
    expect(adminSectionPath("products", locale)).toBe(path);
  });

  test("lists one set of sections, in the navigation's order, and opens on the orders", () => {
    expect(ADMIN_SECTIONS).toEqual([
      "orders",
      "products",
      "categories",
      "filters",
      "home",
      "settings",
      "users",
      "metrics",
    ]);
    expect(ADMIN_LANDING_SECTION).toBe("orders");
  });

  test("the sign-in page carries where to come back, encoded", () => {
    expect(signInPath("/en/admin/orders?x=1", "en")).toBe(
      "/en/admin/sign-in?next=%2Fen%2Fadmin%2Forders%3Fx%3D1"
    );
  });

  test.each([
    ["products", true],
    ["filters", true],
    ["users", true],
    ["metrics", true],
    ["platform", false],
    ["stores", false],
    ["", false],
  ])("%j is an admin section: %s", (value, expected) => {
    expect(isAdminSection(value)).toBe(expected);
  });
});

describe("safeReturnPath", () => {
  test.each([
    ["/admin/products", "/admin/products"],
    ["/admin", "/admin"],
    ["/admin/orders?status=received", "/admin/orders?status=received"],
  ])("goes back to the admin page %j", (next, expected) => {
    expect(safeReturnPath(next, "es")).toBe(expected);
  });

  test.each([
    ["es", "/en/admin/metrics", "/admin/metrics"],
    ["en", "/admin/metrics", "/en/admin/metrics"],
    ["en", "/en/admin/orders?page=2", "/en/admin/orders?page=2"],
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
    ["/products"],
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
