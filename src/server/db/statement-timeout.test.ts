import { describe, expect, test, vi } from "vitest";

import type { Database } from "@/server/db";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { withStatementTimeout } from "./statement-timeout";

/**
 * A database double whose transaction hands out a handle of its own, so a
 * test can tell what ran inside it from what ran outside, and the read that
 * runs under the limit.
 */
function setup() {
  const db = createMockDatabase();
  const tx = createMockDatabase();
  const order: string[] = [];
  db.$.transaction.mockImplementation(async (callback: unknown) =>
    typeof callback === "function" ? await callback(tx) : undefined
  );
  tx.$.execute.mockImplementation(async () => {
    order.push("limit");
    await Promise.resolve();
  });
  const run = vi.fn(async (handle: unknown) => {
    order.push("read");
    return await Promise.resolve(handle === tx ? "answer" : "outside");
  });

  return { db, order, run, tx };
}

describe("withStatementTimeout", () => {
  test("sets the limit for its transaction only, as a parameter, then runs the read inside it", async () => {
    const { db, order, run, tx } = setup();

    await expect(withStatementTimeout(db as never, 4000, run)).resolves.toBe(
      "answer"
    );

    expect(
      tx.$.execute.mock.calls.map(([query]) => renderQuery(query))
    ).toEqual([
      {
        params: ["4000"],
        sql: "select set_config('statement_timeout', $1, true)",
      },
    ]);
    expect(db.$.execute).not.toHaveBeenCalled();
    expect(order).toEqual(["limit", "read"]);
  });

  test("a read the server cancels fails the transaction, which drops the limit with it", async () => {
    const { db, run } = setup();
    const cancelled = new Error("canceling statement due to statement timeout");
    run.mockRejectedValueOnce(cancelled);

    await expect(withStatementTimeout(db as never, 4000, run)).rejects.toBe(
      cancelled
    );
  });

  test("takes the top-level client only: in a caller's transaction, the limit would outlive its savepoint", () => {
    // Proven by `pnpm typecheck`, which fails on an unused `@ts-expect-error`:
    // widen the parameter back to a transaction handle and the suite goes red.
    const insideATransaction = async (
      handle: Parameters<Parameters<Database["transaction"]>[0]>[0]
    ) =>
      await withStatementTimeout(
        // @ts-expect-error -- a transaction handle runs it as a savepoint
        handle,
        4000,
        async () => await Promise.resolve(null)
      );

    expect(insideATransaction).toBeTypeOf("function");
  });
});
