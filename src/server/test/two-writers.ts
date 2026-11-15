import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/server/db";

const heldWriters: (() => void)[] = [];

/**
 * Registers a held writer's release. A test that times out never reaches
 * its own `finally`, and Vitest runs `onTestFinished` after `afterEach`, so
 * a cleanup deleting the writer's rows would wait on its open transaction:
 * `releaseHeldWriters()` first thing in `afterEach` lets it commit.
 */
export function releaseOnTeardown(release: () => void) {
  heldWriters.push(release);
}

/** Releases every writer still held; call it first in `afterEach`. */
export function releaseHeldWriters() {
  for (const release of heldWriters.splice(0)) {
    release();
  }
}

/** A promise and the function that settles it, for ordering two writers. */
export function deferred<T = undefined>() {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });

  return { promise, resolve: settle };
}

/** The server process running this transaction's statements. */
export async function backendPid(tx: DatabaseClient) {
  const result = await tx.execute<{ pid: number }>(
    sql`select pg_backend_pid() as pid`
  );
  const pid = result.rows[0]?.pid;

  if (pid === undefined) {
    throw new Error("The backend has no process id");
  }

  return pid;
}

/**
 * Waits until the `waiter` process waits on an advisory lock that the
 * `holder` process holds: a wait on a row or a unique index, which a writer
 * without the lock could hit, never satisfies it (docs/agents/database.md).
 */
export async function waitUntilAdvisoryBlocked(
  db: DatabaseClient,
  waiter: number,
  holder: number
) {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const result = await db.execute<{ waiting: boolean }>(sql`
      select exists (
        select 1 from pg_locks
        where pid = ${waiter} and locktype = 'advisory' and not granted
      ) and ${holder} = any(pg_blocking_pids(${waiter})) as waiting
    `);

    if (result.rows[0]?.waiting) {
      return;
    }
  }

  throw new Error("The second writer never waited on the first's lock");
}
