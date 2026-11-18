import { describe, expect, test } from "vitest";

import { INT4_MAX } from "@/lib/schemas/catalog";

import {
  newProductPath,
  productPath,
  productsPath,
  readProductId,
  readWizardStep,
  WIZARD_STEPS,
} from "./products";

describe("WIZARD_STEPS", () => {
  test("goes photos, details, review", () => {
    expect(WIZARD_STEPS).toEqual(["photos", "details", "review"]);
  });
});

describe("readWizardStep", () => {
  test.each([
    ["photos", "photos"],
    ["details", "details"],
    ["review", "review"],
    ["Details", "photos"],
    ["done", "photos"],
    ["", "photos"],
    [null, "photos"],
    [undefined, "photos"],
  ])("reads %j as %s", (value, expected) => {
    expect(readWizardStep(value)).toBe(expected);
  });
});

describe("paths", () => {
  test.each([
    ["es", "/admin/products", "/admin/products/new"],
    ["en", "/en/admin/products", "/en/admin/products/new"],
  ] as const)("in %s, the list and a new article", (locale, list, created) => {
    expect(productsPath(locale)).toBe(list);
    expect(newProductPath(locale)).toBe(created);
  });

  test.each([
    [undefined, "es", "/admin/products/12"],
    ["photos", "es", "/admin/products/12"],
    ["details", "es", "/admin/products/12?step=details"],
    ["review", "en", "/en/admin/products/12?step=review"],
  ] as const)("an article at step %s in %s is %s", (step, locale, expected) => {
    expect(productPath(12, locale, step)).toBe(expected);
  });
});

describe("readProductId", () => {
  test.each([
    ["12", 12],
    [String(INT4_MAX), INT4_MAX],
    [String(INT4_MAX + 1), null],
    ["0", null],
    ["012", null],
    ["new", null],
    ["1e3", null],
  ])("reads %s as %s", (segment, expected) => {
    expect(readProductId(segment)).toBe(expected);
  });
});
