import { describe, expect, test } from "vitest";

import { pickRelated, seededRandom } from "./related";

/** `count` articles of a kind, named by kind and number. */
function articles(kind: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${kind}${index + 1}`);
}

function setup({ others = 0, same = 0 }: { others?: number; same?: number }) {
  return { others: articles("o", others), same: articles("s", same) };
}

describe("seededRandom", () => {
  test("gives the same draws for the same seed, others for another, each in [0, 1)", () => {
    const draws = (seed: number) => {
      const random = seededRandom(seed);

      return Array.from({ length: 50 }, () => random());
    };

    expect(draws(42)).toEqual(draws(42));
    expect(draws(42)).not.toEqual(draws(43));
    expect(draws(7).every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(draws(7)).size).toBe(50);
  });
});

describe("pickRelated", () => {
  // The rules' numbers are written out, not read from the module: a test
  // that read the limit would follow it to nine.
  test("without a source keeps the pool's order: the server's render", () => {
    expect(pickRelated(setup({ same: 10 }), null)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
      "s6",
      "s7",
      "s8",
    ]);
  });

  test.each([
    [7, 7],
    [8, 8],
    [9, 8],
    [12, 8],
  ])(
    "with %i in the category, draws %i of them, each once, and none from the rest",
    (same, length) => {
      const pool = setup({ others: 5, same });

      for (const seed of [1, 2, 3, 99]) {
        const picked = pickRelated(pool, seededRandom(seed));

        expect(picked).toHaveLength(length);
        expect(new Set(picked).size).toBe(length);
        expect(picked.every((item) => pool.same.includes(item))).toBe(true);
      }
    }
  );

  test("draws a different pick for different visits, and the same one for the same seed", () => {
    const pool = setup({ same: 16 });

    const first = pickRelated(pool, seededRandom(1));

    expect(pickRelated(pool, seededRandom(1))).toEqual(first);
    expect(pickRelated(pool, seededRandom(2))).not.toEqual(first);
    // The server's order is not what the browser shows.
    expect(first).not.toEqual(pickRelated(pool, null));
  });

  test("with exactly four in the category, shows those four and nothing from the rest", () => {
    const picked = pickRelated(setup({ others: 9, same: 4 }), seededRandom(5));

    expect(new Set(picked)).toEqual(new Set(["s1", "s2", "s3", "s4"]));
    expect(picked).toHaveLength(4);
  });

  test("with three in the category, shows all three first, then fills from the rest up to eight", () => {
    const picked = pickRelated(setup({ others: 9, same: 3 }), seededRandom(5));

    expect(picked).toHaveLength(8);
    expect(new Set(picked.slice(0, 3))).toEqual(new Set(["s1", "s2", "s3"]));
    expect(picked.slice(3).every((item) => item.startsWith("o"))).toBe(true);
    expect(new Set(picked).size).toBe(8);
  });

  test.each([
    [
      "an empty category and a store of two",
      { others: 2, same: 0 },
      ["o1", "o2"],
    ],
    ["nothing anywhere", { others: 0, same: 0 }, []],
    ["a category of two and no rest", { others: 0, same: 2 }, ["s1", "s2"]],
  ])("with %s, shows what there is, each once", (_case, sizes, expected) => {
    const picked = pickRelated(setup(sizes), seededRandom(3));

    // The order is the draw's; which articles and how many are the rule.
    expect(new Set(picked)).toEqual(new Set(expected));
    expect(picked).toHaveLength(expected.length);
  });

  test("the pick's size depends on the pool only, so the server's render and the browser's match", () => {
    for (const sizes of [
      { others: 9, same: 2 },
      { others: 1, same: 1 },
      { others: 0, same: 20 },
    ]) {
      const pool = setup(sizes);

      expect(pickRelated(pool, seededRandom(11))).toHaveLength(
        pickRelated(pool, null).length
      );
    }
  });
});
