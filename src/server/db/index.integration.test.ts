import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

/** What the pool wrote to the log, one parsed line per warning. */
function warnings(warn: { mock: { calls: unknown[][] } }) {
  return warn.mock.calls.map(([line]): unknown => JSON.parse(String(line)));
}

describe("database client", () => {
  // FER-083. Postgres ended a connection in the middle of a transaction
  // ("server conn crashed?" from the pooler). The client's `error` event had
  // no listener, so Node threw it as an uncaught exception, which here would
  // fail the run.
  test("a connection that dies while a transaction holds it fails that transaction and is logged, never thrown at the process", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const held = db.transaction(async (tx) => {
      const { rows } = await tx.execute<{ pid: number }>(
        sql`select pg_backend_pid() as pid`
      );
      // From another connection, as an administrator or a restart would.
      await db.execute(sql`select pg_terminate_backend(${rows[0]?.pid})`);
      // The client hears of it between two statements, with none running:
      // Postgres's goodbye, then the socket closing.
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledTimes(2);
      });

      await tx.execute(sql`select 1`);
    });

    // The next statement is refused, and that is the failure the caller
    // gets: the patched transaction (FER-057) tries no rollback on a
    // connection it heard die, so the rollback's own failure hides nothing.
    await expect(held).rejects.toThrow("Failed query: select 1");
    expect(warnings(warn)).toEqual([
      {
        action: "Db.client_error",
        code: "57P01",
        level: "warn",
        message: "terminating connection due to administrator command",
        name: "error",
      },
      {
        action: "Db.client_error",
        level: "warn",
        message: "Connection terminated unexpectedly",
        name: "Error",
      },
    ]);
    // The pool replaced the dead connection.
    await expect(db.execute(sql`select 1 as one`)).resolves.toMatchObject({
      rows: [{ one: 1 }],
    });
  });
});
