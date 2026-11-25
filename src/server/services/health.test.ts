import { describe, expect, test } from "vitest";

import { isSingleConnectAttempt } from "@/server/db/resilient-pool";
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

  test("sends it where the pool opens a connection once, never retried", async () => {
    const { db } = setup();
    let single: boolean | undefined;
    db.$.execute.mockImplementation(async () => {
      single = isSingleConnectAttempt();
      return await Promise.resolve([]);
    });

    await pingDatabase(db as never);

    expect(single).toBe(true);
    // The scope ends with the ping.
    expect(isSingleConnectAttempt()).toBe(false);
  });
});
