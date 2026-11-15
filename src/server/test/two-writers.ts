import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/server/db";

interface HeldWriters {
  release: () => void;
  /** Settles once every writer of the test has finished, either way. */
  settled: () => Promise<unknown>;
}

const heldWriters: HeldWriters[] = [];

/**
 * Registers a held writer's release, and how to wait for its writers. A
 * test that times out never reaches its own `finally`, and Vitest runs
 * `onTestFinished` after `afterEach`, so a cleanup deleting the writers'
 * rows would race them: `await releaseHeldWriters()` first thing in
 * `afterEach` lets them commit and waits for them.
 */
export function releaseOnTeardown(
  release: () => void,
  settled: () => Promise<unknown>
) {
  heldWriters.push({ release, settled });
}

/**
 * Releases every writer still held and waits for all of them to finish;
 * call it first in `afterEach`.
 */
export async function releaseHeldWriters() {
  const held = heldWriters.splice(0);

  for (const writer of held) {
    writer.release();
  }

  await Promise.allSettled(held.map(async (writer) => await writer.settled()));
}

/**
 * `ready`, unless `work` fails first: a writer that throws before it
 * signals fails the test with its own error instead of leaving it waiting
 * on a signal that never comes. `work` finishing without a failure keeps
 * waiting on `ready`.
 */
export async function readyOrFailed<T>(
  ready: Promise<T>,
  work: Promise<unknown>
): Promise<T> {
  return await Promise.race([ready, work.then(async () => await ready)]);
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

/**
 * Waits until the `waiter` process waits on any lock the `holder` process
 * holds: a row lock, where the advisory one above does not apply.
 */
export async function waitUntilBlockedBy(
  db: DatabaseClient,
  waiter: number,
  holder: number
) {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const result = await db.execute<{ waiting: boolean }>(
      sql`select ${holder} = any(pg_blocking_pids(${waiter})) as waiting`
    );

    if (result.rows[0]?.waiting) {
      return;
    }
  }

  throw new Error("The second writer never waited on the first");
}
