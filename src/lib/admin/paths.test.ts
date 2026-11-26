import { describe, test, expect } from "vitest";

import { INT4_MAX } from "@/lib/schemas/catalog";

import {
  ADMIN_LANDING_SECTION,
  ADMIN_SECTIONS,
  adminSectionPath,
  afterPasswordChangePath,
  changePasswordPath,
  isAdminSection,
  readRowId,
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
      "pages",
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
    [
      "en",
      "/en/admin/orders?x=1",
      "/en/admin/change-password?next=%2Fen%2Fadmin%2Forders%3Fx%3D1",
    ],
    ["es", "/admin/users", "/admin/change-password?next=%2Fadmin%2Fusers"],
  ] as const)(
    "the change-password page in %s carries where to come back, encoded",
    (locale, returnTo, path) => {
      expect(changePasswordPath(returnTo, locale)).toBe(path);
    }
  );

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
    ["/admin/change-passwords", "/admin/change-passwords"],
    ["/admin/users", "/admin/users"],
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

  test("comes back to the change-password page a signed-out visit was sent from (FER-015)", () => {
    expect(
      safeReturnPath("/admin/change-password?next=%2Fadmin%2Fusers", "es")
    ).toBe("/admin/change-password?next=%2Fadmin%2Fusers");
  });
});

describe("afterPasswordChangePath", () => {
  test.each([
    ["/admin/users", "/admin/users"],
    ["/admin/orders?status=received", "/admin/orders?status=received"],
    // Only the page itself is refused, not one that starts with its name.
    ["/admin/change-passwords", "/admin/change-passwords"],
  ])("goes on to the admin page %j", (next, expected) => {
    expect(afterPasswordChangePath(next, "es")).toBe(expected);
  });

  test.each([
    ["/admin/change-password"],
    ["/en/admin/change-password?next=%2Fen%2Fadmin"],
    ["/admin/change-password/again"],
    ["/admin/sign-in"],
    ["//evil.example/admin"],
    ["/products"],
    [undefined],
  ])(
    "falls back to the landing for %j, never the change-password page again",
    (next) => {
      expect(afterPasswordChangePath(next, "en")).toBe("/en/admin");
    }
  );
});

describe("readRowId", () => {
  test.each([
    ["1", 1],
    [String(INT4_MAX), INT4_MAX],
    [String(INT4_MAX + 1), null],
    ["0", null],
    ["-3", null],
    ["07", null],
    [" 7", null],
    ["7.0", null],
  ])("reads %s as %s", (segment, expected) => {
    expect(readRowId(segment)).toBe(expected);
  });
});
