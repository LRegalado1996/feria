// A namespace import, as in `@/lib/sentry`: `pnpm db:seed` runs this module
// under plain Node ESM, which cannot see the CommonJS build's named exports.
import * as Sentry from "@sentry/nextjs";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";

import { env } from "@/env";
import { sanitizeForLog } from "@/lib/redaction";
import { CONNECT_RETRY, CONNECT_TIMEOUT_MS } from "@/server/db/connect-retry";
import { withExplicitSslMode } from "@/server/db/connection-string";
import { ResilientPool } from "@/server/db/resilient-pool";
import * as schema from "@/server/db/schema";

// The member is optional, so `globalThis` satisfies the shape as it is and
// the cache needs no cast to be read or written.
type GlobalWithDatabase = typeof globalThis & { pool?: ResilientPool };

const globalForDb: GlobalWithDatabase = globalThis;

/** One warning line and one Sentry breadcrumb per database hiccup. */
function warn(
  action: string,
  error: Error,
  extra: Record<string, number> = {}
) {
  const message = sanitizeForLog(error.message);
  const code = "code" in error ? sanitizeForLog(error.code) : undefined;
  console.warn(
    JSON.stringify({
      level: "warn",
      action,
      name: error.name,
      code,
      message,
      ...extra,
    })
  );
  Sentry.addBreadcrumb({
    category: "db.pool",
    level: "warning",
    message: `${action} ${error.name}: ${String(message)}`,
  });
}

function createPool(): ResilientPool {
  const pool = new ResilientPool(
    {
      // `verify-full` spelled out: what pg already does for Neon's
      // `sslmode=require`, without its deprecation warning on every boot.
      connectionString: withExplicitSslMode(env.DATABASE_URL),
      // No `min`: a connection kept open below it is never closed on idle, so
      // it outlives the instance's suspension, and Neon (its compute scaling
      // to zero, its pooler) drops it meanwhile. `attachDatabasePool` keeps
      // the instance up until the idle timeout has closed every connection.
      // `max` stays at pg's default so concurrent requests on one warm
      // serverless instance are not serialized (Vercel warns against `max: 1`).
      //
      // TCP keep-alives let the driver notice a socket killed underneath it.
      keepAlive: true,
      // Long enough to outlive the lulls between request bursts: a short idle
      // timeout retires the pool between them and pays a fresh connection on
      // the next request.
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    },
    {
      // Opening a connection, never a statement, is retried (`ResilientPool`).
      ...CONNECT_RETRY,
      onRetry: (error, attempt) => {
        warn("Db.connect_retry", error, { attempt });
      },
    }
  );

  // A client whose connection dies emits `error` (the pooler's "server conn
  // crashed?", a socket the platform retired), and an `error` nobody listens
  // to is an uncaught exception that takes the whole instance down, with
  // every request it is serving. pg-pool listens only while a client sits
  // idle and takes its listener off at checkout, so a client that dies
  // between two statements of a transaction had none. This one stays for the
  // client's life. Whoever holds the client still gets the failure from its
  // next statement, so each event (Postgres's goodbye and the socket closing
  // are two) is a warning and a Sentry breadcrumb on whatever fails next,
  // never an issue of its own.
  const reported = new WeakSet<Error>();
  pool.on("connect", (client) => {
    client.on("error", (error) => {
      reported.add(error);
      warn("Db.client_error", error);
    });
  });

  // pg-pool passes an idle client's error on as its own `error`, and throws
  // it when the pool has no listener. The client's listener above has already
  // reported it, except for a client that never finished connecting, which
  // has none: that error is reported here. The pool replaces the client on
  // the next query.
  pool.on("error", (error) => {
    if (!reported.has(error)) {
      warn("Db.client_error", error);
    }
  });

  // Closes idle connections before Vercel suspends the instance, so a dead
  // socket is not handed to the next request. A no-op off Vercel.
  attachDatabasePool(pool);

  return pool;
}

const pool = globalForDb.pool ?? createPool();

// A dev reload re-evaluates this module; reusing the pool keeps it from
// opening a new one each time.
if (env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });

export type Database = typeof db;

/**
 * The top-level client or a transaction handle. A service takes this, so a
 * caller can run it inside its own `db.transaction(...)` on one connection.
 */
export type DatabaseClient =
  | Database
  | Parameters<Parameters<Database["transaction"]>[0]>[0];
