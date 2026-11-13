import { Client } from "pg";
import type { TestProject } from "vitest/node";

/** Database URL of the clone that Vitest worker `poolId` runs against. */
export function workerDatabaseUrl(templateUrl: string, poolId: number): string {
  const url = new URL(templateUrl);
  url.pathname = `/${templateName(url)}_w${poolId}`;
  return url.toString();
}

function templateName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

/** A database name is an identifier, which cannot be a bind parameter. */
function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Drops every `<template>_w<n>`, including clones of an earlier, wider run. */
async function dropClones(admin: Client, template: string) {
  const { rows } = await admin.query<{ datname: string }>(
    "select datname from pg_database"
  );
  const prefix = `${template}_w`;

  for (const { datname } of rows) {
    if (
      datname.startsWith(prefix) &&
      /^\d+$/.test(datname.slice(prefix.length))
    ) {
      await admin.query(
        `drop database if exists ${quoteIdent(datname)} with (force)`
      );
    }
  }
}

/**
 * CREATE DATABASE refuses a template anyone is connected to. CI's database is
 * idle here; locally a dev server's pool may hold connections, which it
 * re-opens on its next query, and one can slip back in between the two
 * statements (`55006`), so that case closes them again and retries.
 */
async function cloneTemplate(
  admin: Client,
  template: string,
  clone: string,
  attemptsLeft = 3
): Promise<void> {
  await admin.query(
    "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
    [template]
  );

  try {
    await admin.query(
      `create database ${quoteIdent(clone)} template ${quoteIdent(template)}`
    );
  } catch (error) {
    const inUse = (error as { code?: unknown }).code === "55006";

    if (!inUse || attemptsLeft <= 1) {
      throw error;
    }

    await cloneTemplate(admin, template, clone, attemptsLeft - 1);
  }
}

/**
 * One run per template at a time: a second `pnpm test:integration` against
 * the same database would drop this run's clones from under its workers (same
 * names, dropped WITH FORCE), so it waits here. A session lock: a killed run
 * releases it with its connection, and the next run drops what it left.
 */
async function lockTemplate(admin: Client, template: string) {
  const byOid = "from pg_database where datname = $1";
  const { rows } = await admin.query<{ locked: boolean }>(
    `select pg_try_advisory_lock(oid::bigint) as locked ${byOid}`,
    [template]
  );

  if (rows[0]?.locked) {
    return;
  }

  process.stderr.write(
    `integration: another run is using "${template}"; waiting for it to finish\n`
  );
  await admin.query(`select pg_advisory_lock(oid::bigint) ${byOid}`, [
    template,
  ]);
}

/**
 * Runs once per integration run, before any worker starts.
 *
 * Every Vitest worker gets its own database, cloned from the migrated one in
 * `DATABASE_URL` (`integration-worker-database.ts` points the worker at it).
 * Files running at the same time never share a row, so they run in parallel;
 * files that share a worker run one after another and clean up what they
 * create. Fails closed: no `DATABASE_URL`, no run, never a green job with
 * zero tests.
 */
export async function setup(project: TestProject) {
  const templateUrl = process.env.DATABASE_URL;

  if (!templateUrl) {
    throw new Error(
      "Integration tests need DATABASE_URL: run them through `pnpm test:integration`, which starts this worktree's Postgres."
    );
  }

  const template = templateName(new URL(templateUrl));
  const adminUrl = new URL(templateUrl);
  adminUrl.pathname = "/postgres";
  const workers = project.config.maxWorkers;

  // Held until teardown: it carries the run lock.
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  // Losing this connection releases the lock, after which another run may
  // drop these clones under the workers: stop rather than carry on (an
  // unhandled pg `error` would otherwise crash Vitest with a bare stack).
  let lockLost = false;
  admin.on("error", (error) => {
    // pg reports one disconnect more than once.
    if (lockLost) {
      return;
    }

    lockLost = true;
    process.stderr.write(
      `integration: lost the connection holding the run lock on "${template}" (${error.message}); cancelling the run\n`
    );
    void project.vitest.cancelCurrentRun("test-failure");
  });

  try {
    await lockTemplate(admin, template);
    await dropClones(admin, template);

    for (let poolId = 1; poolId <= workers; poolId++) {
      await cloneTemplate(admin, template, `${template}_w${poolId}`);
    }
  } catch (error) {
    await admin.end();
    throw error;
  }

  return async function teardown() {
    // Another run may hold the lock by now; whoever takes it next drops
    // these clones.
    if (lockLost) {
      return;
    }

    try {
      await dropClones(admin, template);
    } finally {
      await admin.end();
    }
  };
}
