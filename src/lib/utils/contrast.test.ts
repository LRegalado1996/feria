import { describe, expect, test } from "vitest";

import { contrastRatio, mixSrgb } from "./contrast";

describe("contrastRatio", () => {
  test.each([
    ["black on white", "#000000", "#ffffff", 21],
    ["a color on itself", "#c8f31d", "#c8f31d", 1],
    // The textbook AA boundary: #767676 is the lightest gray that passes on white.
    ["the lightest AA gray on white", "#767676", "#ffffff", 4.54],
    ["one step lighter, which fails AA", "#777777", "#ffffff", 4.48],
    ["the default text on its background", "#111312", "#f2f3f0", 16.75],
    ["the default text on the accent", "#111312", "#c8f31d", 14.47],
  ])("%s", (_case, first, second, expected) => {
    expect(contrastRatio(first, second)).toBeCloseTo(expected, 2);
  });

  test("does not depend on which color comes first", () => {
    expect(contrastRatio("#ffffff", "#111312")).toBe(
      contrastRatio("#111312", "#ffffff")
    );
  });

  test("reads uppercase digits the same as lowercase", () => {
    expect(contrastRatio("#C8F31D", "#111312")).toBe(
      contrastRatio("#c8f31d", "#111312")
    );
  });

  test.each(["#fff", "111312", "#11131g", "red", ""])(
    "refuses %j, which is not a six-digit hex color",
    (value) => {
      expect(() => contrastRatio(value, "#ffffff")).toThrow(
        `Not a six-digit hex color: ${value}`
      );
    }
  );
});

describe("mixSrgb", () => {
  test.each([
    ["all of the color", 100, "#102030"],
    ["none of the color", 0, "#f0e0d0"],
    ["half of each", 50, "#808080"],
    ["a quarter of the color", 25, "#b8b0a8"],
  ])("%s", (_case, percent, expected) => {
    expect(mixSrgb("#102030", "#f0e0d0", percent)).toBe(expected);
  });

  test("pads a channel that mixes to a single hex digit", () => {
    expect(mixSrgb("#000000", "#0a0a0a", 50)).toBe("#050505");
  });

  test("matches the muted text the default palette derives in CSS", () => {
    // color-mix(in srgb, #111312 68%, #f2f3f0), small text on the background.
    const muted = mixSrgb("#111312", "#f2f3f0", 68);

    expect(muted).toBe("#595b59");
    expect(contrastRatio(muted, "#f2f3f0")).toBeCloseTo(6.15, 2);
  });
});
