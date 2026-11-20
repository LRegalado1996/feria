import { describe, expect, test } from "vitest";

import { pickReorderCategory } from "./reorder";

/** A random source that answers `value` every time. */
function always(value: number) {
  return () => value;
}

describe("pickReorderCategory", () => {
  test.each([
    [0, 2],
    [0.49, 2],
    [0.5, 7],
    [0.999, 7],
  ])(
    "draws among the categories with a row's worth: %s picks %s",
    (draw, expected) => {
      expect(
        pickReorderCategory(
          [
            { categoryId: 1, count: 3 },
            { categoryId: 2, count: 4 },
            { categoryId: 7, count: 9 },
          ],
          always(draw)
        )
      ).toBe(expected);
    }
  );

  test("falls back to any category with an article when none has four", () => {
    expect(
      pickReorderCategory(
        [
          { categoryId: 1, count: 3 },
          { categoryId: 5, count: 0 },
          { categoryId: 6, count: 1 },
        ],
        always(0.99)
      )
    ).toBe(6);
  });

  test.each([
    ["no category", []],
    ["only empty ones", [{ categoryId: 1, count: 0 }]],
  ])("with %s, picks none", (_label, counts) => {
    expect(pickReorderCategory(counts, always(0))).toBeNull();
  });
});
