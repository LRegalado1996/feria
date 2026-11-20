import { sql } from "drizzle-orm";

import type { Database, DatabaseClient } from "@/server/db";

/**
 * Runs `run` in a transaction whose statements Postgres cancels after `ms`
 * (`SET LOCAL statement_timeout`, gone at its commit or rollback). A caller
 * that stops waiting with `within()` only stops waiting: the query keeps its
 * pooled connection until it ends. This ends it on the server, so a stalled
 * read gives its connection back instead of piling up behind the next one.
 * Only what runs on the server is bounded: a connection the pool cannot open
 * is bounded by the pool's own `connectionTimeoutMillis`.
 *
 * It takes the top-level client only: given a transaction handle, its
 * transaction would be a savepoint, and a local setting outlives a released
 * savepoint, so the limit would cancel the caller's later statements too.
 */
export async function withStatementTimeout<T>(
  db: Database,
  ms: number,
  run: (tx: DatabaseClient) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    // `SET` takes no parameters; `set_config(..., true)` is its local form
    // and does, so the limit is never spliced into the SQL text.
    await tx.execute(
      sql`select set_config('statement_timeout', ${String(ms)}, true)`
    );

    return await run(tx);
  });
}
