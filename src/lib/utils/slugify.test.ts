import { describe, expect, test } from "vitest";

import { firstFreeSlug, slugify } from "./slugify";

describe("slugify", () => {
  test.each([
    ["Collar Dorado Ñandú", "collar-dorado-nandu"],
    ["  Aros   de plata  ", "aros-de-plata"],
    ["Anillo 18k — oro/plata", "anillo-18k-oro-plata"],
    ["PULSERA", "pulsera"],
    ["¡¡¡", "articulo"],
    ["", "articulo"],
  ])("makes %j into %j", (text, slug) => {
    expect(slugify(text, "articulo")).toBe(slug);
  });

  test("cuts at 80 characters without leaving a dash at the end", () => {
    const slug = slugify(`${"a".repeat(79)} bcd`, "articulo");

    expect(slug).toBe("a".repeat(79));
  });

  test("keeps exactly 80 characters", () => {
    expect(slugify("a".repeat(80), "articulo")).toHaveLength(80);
    expect(slugify("a".repeat(81), "articulo")).toBe("a".repeat(80));
  });
});

describe("firstFreeSlug", () => {
  test.each([
    [[], "collar"],
    [["collar"], "collar-2"],
    [["collar", "collar-2"], "collar-3"],
    [["collar-2"], "collar"],
  ])("with %j taken, picks %j", (taken, slug) => {
    expect(firstFreeSlug("collar", new Set(taken))).toBe(slug);
  });

  test("cuts the base, not the number, to stay within 80 characters", () => {
    const base = "a".repeat(80);

    expect(firstFreeSlug(base, new Set([base]))).toBe(`${"a".repeat(78)}-2`);
  });
});
