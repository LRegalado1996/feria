import { describe, expect, test } from "vitest";

import { createMockDatabase } from "@/server/test/context";
import { renderSql } from "@/server/test/render-sql";

import { pingDatabase } from "./health";

function setup() {
  const db = createMockDatabase();

  return {
    db,
    // The SQL of every round trip, in order.
    queries: () => db.$.execute.mock.calls.map(([query]) => renderSql(query)),
  };
}

describe("pingDatabase", () => {
  test("sends exactly one `select 1`", async () => {
    const { db, queries } = setup();

    await pingDatabase(db as never);

    expect(queries()).toEqual(["select 1"]);
  });

  test("propagates the driver's failure without retrying", async () => {
    const { db, queries } = setup();
    const failure = new Error("connection refused");
    db.$.execute.mockRejectedValue(failure);

    await expect(pingDatabase(db as never)).rejects.toBe(failure);
    expect(queries()).toEqual(["select 1"]);
  });
});
