import { describe, expect, test } from "vitest";

import { inOrder } from "./in-order";

function makeRow(id: number, position: number) {
  return { id, name: `Row ${id}`, position };
}

const ROWS = [makeRow(1, 0), makeRow(2, 1), makeRow(3, 2)];

describe("inOrder", () => {
  test("puts the rows in the order of the ids, positions renumbered from zero", () => {
    expect(inOrder(ROWS, [3, 1, 2])).toEqual([
      makeRow(3, 0),
      makeRow(1, 1),
      makeRow(2, 2),
    ]);
  });

  test("drops an id the rows do not hold, numbering the rest without a gap", () => {
    expect(inOrder(ROWS, [2, 9, 1, 3])).toEqual([
      makeRow(2, 0),
      makeRow(1, 1),
      makeRow(3, 2),
    ]);
  });

  test("keeps a row the ids do not list (one read after the move) after the listed ones", () => {
    const rows = [
      makeRow(4, 0),
      ...ROWS.map((row) => makeRow(row.id, row.position + 1)),
    ];

    expect(inOrder(rows, [3, 1, 2])).toEqual([
      makeRow(3, 0),
      makeRow(1, 1),
      makeRow(2, 2),
      makeRow(4, 3),
    ]);
  });

  test("copies the rows, leaving the ones it was given as they were", () => {
    const rows = [makeRow(1, 5), makeRow(2, 7)];

    expect(inOrder(rows, [1, 2])).toEqual([makeRow(1, 0), makeRow(2, 1)]);
    expect(rows).toEqual([makeRow(1, 5), makeRow(2, 7)]);
  });

  test("with no ids, keeps the rows in their own order", () => {
    expect(inOrder(ROWS, [])).toEqual(ROWS);
  });
});
