import { describe, expect, test } from "vitest";

import { addDays, daySpan, eachDay } from "./days";

describe("addDays", () => {
  test.each([
    ["the next day", "2026-12-05", 1, "2026-12-06"],
    ["across a month's end", "2026-11-30", 1, "2026-12-01"],
    ["across a year's end", "2026-12-31", 1, "2027-01-01"],
    ["into a leap day", "2028-02-28", 1, "2028-02-29"],
    ["backwards", "2026-12-05", -29, "2026-11-06"],
    ["none", "2026-12-05", 0, "2026-12-05"],
  ])("moves %s: %s by %i is %s", (_case, day, amount, expected) => {
    expect(addDays(day, amount)).toBe(expected);
  });
});

describe("daySpan", () => {
  test.each([
    ["one day", "2026-12-05", "2026-12-05", 1],
    ["a week", "2026-12-01", "2026-12-07", 7],
    ["a leap year", "2028-01-01", "2028-12-31", 366],
    ["a range that ends before it starts", "2026-12-05", "2026-12-04", 0],
  ])("counts %s, both ends included", (_case, from, to, expected) => {
    expect(daySpan(from, to)).toBe(expected);
  });
});

describe("eachDay", () => {
  test("lists every day of the range in order", () => {
    expect(eachDay("2026-11-29", "2026-12-02")).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
  });

  test("is empty for a range that ends before it starts", () => {
    expect(eachDay("2026-12-05", "2026-12-04")).toEqual([]);
  });
});
