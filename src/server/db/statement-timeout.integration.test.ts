import { sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";

import { withStatementTimeout } from "./statement-timeout";

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

/** Postgres's `statement_timeout`, as the next statement on `client` sees it. */
async function readLimit(client: Pick<typeof db, "execute">) {
  const { rows } = await client.execute<{ statement_timeout: string }>(
    sql`show statement_timeout`
  );

  return rows[0]?.statement_timeout;
}

describe("withStatementTimeout", () => {
  test("Postgres cancels a statement that outlasts the limit, on the server", async () => {
    const started = Date.now();

    await expect(
      withStatementTimeout(db, 50, async (tx) => {
        await tx.execute(sql`select pg_sleep(2)`);
      })
    ).rejects.toMatchObject({ cause: { code: "57014" } });
    // Cancelled by the limit, not run to its end.
    expect(Date.now() - started).toBeLessThan(1500);
  });

  test("a statement inside the limit answers, under the limit, which ends with its transaction", async () => {
    const inside = await withStatementTimeout(db, 1000, async (tx) => {
      await tx.execute(sql`select pg_sleep(0.01)`);

      return await readLimit(tx);
    });

    expect(inside).toBe("1s");
    expect(await readLimit(db)).toBe("0");
  });
});
