import { afterEach, describe, expect, test, vi } from "vitest";

// This file is about the real module, not the double `setup-common.ts` gives
// every other test.
vi.unmock("@/server/db");

type Listener = (error: Error) => void;

const { addBreadcrumb, attachDatabasePool, env, Pool } = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  attachDatabasePool: vi.fn(),
  env: { DATABASE_URL: "postgresql://app@db.test:5432/app", NODE_ENV: "test" },
  // Stands in for pg's Pool: records its options and listeners, never connects.
  // oxlint-disable-next-line prefer-arrow-callback -- called with `new`, which an arrow function cannot be
  Pool: vi.fn(function Pool(options: unknown) {
    const listeners = new Map<string, Listener>();
    return {
      options,
      listeners,
      on: vi.fn((event: string, listener: Listener) => {
        listeners.set(event, listener);
      }),
    };
  }),
}));

vi.mock("pg", () => ({ Pool }));
vi.mock("@vercel/functions", () => ({ attachDatabasePool }));
vi.mock("@sentry/nextjs", () => ({ addBreadcrumb }));
vi.mock("@/env", () => ({ env }));

afterEach(() => {
  Reflect.deleteProperty(globalThis, "pool");
  vi.restoreAllMocks();
});

// Each load evaluates the module afresh, as a new server instance or a dev
// hot reload does.
async function loadDatabase(nodeEnv: string) {
  env.NODE_ENV = nodeEnv;
  vi.resetModules();
  return await import("./index");
}

function createdPool(): ReturnType<typeof Pool> {
  const result = Pool.mock.results.at(-1);

  if (result?.type !== "return") {
    throw new Error("no Pool was created");
  }

  return result.value;
}

describe("database client", () => {
  test("opens one pool on DATABASE_URL with serverless-safe settings", async () => {
    await loadDatabase("test");

    // No `max`: pg's default lets one warm instance serve concurrent requests.
    expect(Pool).toHaveBeenCalledExactlyOnceWith({
      connectionString: "postgresql://app@db.test:5432/app",
      min: 1,
      keepAlive: true,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  });

  test("hands the pool to Vercel once and builds the Drizzle client on it", async () => {
    const { db } = await loadDatabase("test");

    expect(attachDatabasePool).toHaveBeenCalledExactlyOnceWith(createdPool());
    expect(db.$client).toBe(createdPool());
  });

  test("builds the relational API from every table in the schema", async () => {
    const { db } = await loadDatabase("test");

    expect(new Set(Object.keys(db.query))).toEqual(
      new Set([
        "account",
        "post",
        "rateLimit",
        "session",
        "store",
        "storeTranslation",
        "user",
        "verification",
      ])
    );
  });

  test("turns an idle client's error into a sanitized warning and a breadcrumb", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await loadDatabase("test");
    const pool = createdPool();

    // Without a listener, pg rethrows the error and kills the function.
    expect(pool.on).toHaveBeenCalledExactlyOnceWith(
      "error",
      expect.any(Function)
    );
    pool.listeners.get("error")?.(
      new Error("Failed query: select 1\nparams: secret-session-token")
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        level: "warn",
        action: "Db.pool_client_error",
        name: "Error",
        message: "Failed query: select 1\nparams: [REDACTED]",
      })
    );
    expect(addBreadcrumb).toHaveBeenCalledExactlyOnceWith({
      category: "db.pool",
      level: "warning",
      message: "Error: Failed query: select 1\nparams: [REDACTED]",
    });
  });

  test("reuses the pool across reloads outside production", async () => {
    const first = await loadDatabase("development");
    const second = await loadDatabase("development");

    expect(second.db.$client).toBe(first.db.$client);
    expect(Pool).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        connectionString: "postgresql://app@db.test:5432/app",
      })
    );
    expect(attachDatabasePool).toHaveBeenCalledExactlyOnceWith(
      first.db.$client
    );
  });

  test("opens a fresh pool per instance in production", async () => {
    const first = await loadDatabase("production");
    const second = await loadDatabase("production");

    expect(second.db.$client).not.toBe(first.db.$client);
    expect(Reflect.has(globalThis, "pool")).toBe(false);
  });
});
