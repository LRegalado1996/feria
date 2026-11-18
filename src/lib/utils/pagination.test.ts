import { describe, expect, test } from "vitest";

import { paginationItems } from "./pagination";

/** The places as text: page numbers, `…` for a gap. */
function places(page: number, pageCount: number): string {
  return paginationItems(page, pageCount)
    .map((item) => (item.kind === "page" ? String(item.page) : "…"))
    .join(" ");
}

describe("paginationItems", () => {
  test.each([
    [1, 0, ""],
    [1, 1, "1"],
    [3, 7, "1 2 3 4 5 6 7"],
    [1, 8, "1 2 3 4 5 … 8"],
    [4, 8, "1 2 3 4 5 … 8"],
    [5, 8, "1 … 4 5 6 7 8"],
    [8, 8, "1 … 4 5 6 7 8"],
    [5, 10, "1 … 4 5 6 … 10"],
    [6, 10, "1 … 5 6 7 … 10"],
    [7, 10, "1 … 6 7 8 9 10"],
    [0, 10, "1 2 3 4 5 … 10"],
    [99, 10, "1 … 6 7 8 9 10"],
  ])("page %i of %i shows %j", (page, pageCount, expected) => {
    expect(places(page, pageCount)).toBe(expected);
  });

  test("never shows more than seven places, however many pages", () => {
    for (let page = 1; page <= 40; page += 1) {
      expect(paginationItems(page, 40).length).toBeLessThanOrEqual(7);
    }
  });

  test("tells the gap before the current pages from the one after them", () => {
    expect(
      paginationItems(5, 10).filter((item) => item.kind === "gap")
    ).toEqual([
      { kind: "gap", side: "start" },
      { kind: "gap", side: "end" },
    ]);
  });
});
