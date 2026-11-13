// A namespace import, as in `@/lib/sentry`: `pnpm db:seed` runs this module
// under plain Node ESM, which cannot see the CommonJS build's named exports.
import * as Sentry from "@sentry/nextjs";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/env";
import { sanitizeForLog } from "@/lib/redaction";
import * as schema from "@/server/db/schema";

// The member is optional, so `globalThis` satisfies the shape as it is and
// the cache needs no cast to be read or written.
type GlobalWithDatabase = typeof globalThis & { pool?: Pool };

const globalForDb: GlobalWithDatabase = globalThis;

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    // One warm connection per instance. `max` stays at pg's default so
    // concurrent requests on one warm serverless instance are not serialized
    // (Vercel warns against `max: 1`).
    min: 1,
    // TCP keep-alives let the driver notice a socket killed underneath it.
    keepAlive: true,
    // Long enough to outlive the lulls between request bursts: a short idle
    // timeout retires the pool between them and pays a fresh connection on
    // the next request.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // node-postgres re-throws an idle client's error (the platform suspended
  // the instance, the pooler retired the socket) as an uncaught exception
  // that kills the function, unless the pool has a listener. The pool
  // replaces the client on the next query, so it is a warning and a Sentry
  // breadcrumb on whatever fails next, never an issue of its own.
  pool.on("error", (error) => {
    const message = sanitizeForLog(error.message);
    console.warn(
      JSON.stringify({
        level: "warn",
        action: "Db.pool_client_error",
        name: error.name,
        message,
      })
    );
    Sentry.addBreadcrumb({
      category: "db.pool",
      level: "warning",
      message: `${error.name}: ${String(message)}`,
    });
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
