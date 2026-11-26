import { describe, expect, test } from "vitest";

import { readSearchText, searchTextSchema } from "./index";

describe("searchTextSchema", () => {
  test.each([
    ["  aro  ", "aro"],
    ["", undefined],
    ["   ", undefined],
    [undefined, undefined],
    ["abcde", "abcde"],
  ])("reads %j as %j", (value, expected) => {
    expect(searchTextSchema(5).parse(value)).toBe(expected);
  });

  test("refuses a search past its length, trimmed first", () => {
    expect(searchTextSchema(5).safeParse(" abcde ").success).toBe(true);
    expect(searchTextSchema(5).safeParse("abcdef").success).toBe(false);
  });

  test.each(["ar\u0000o", "\u0000", " \u0000 "])(
    "refuses %j, which holds U+0000, with its reason",
    (value) => {
      expect(
        searchTextSchema(5)
          .safeParse(value)
          .error?.issues.map((issue) => issue.message)
      ).toEqual(["A search cannot hold U+0000"]);
    }
  );
});

describe("readSearchText", () => {
  test.each([
    [null, null],
    ["", null],
    ["   ", null],
    ["\u0000", null],
    [" \u0000 aro ", "aro"],
    ["ar\u0000o", "aro"],
    ["abcde", "abcde"],
    ["abcdef", "abcde"],
    ["  abcdef", "abcde"],
    ["\u0000abcdef", "abcde"],
  ])("reads %j as %j", (value, expected) => {
    expect(readSearchText(value, 5)).toBe(expected);
  });
});
