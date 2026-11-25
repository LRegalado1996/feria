import { afterEach, describe, expect, test, vi } from "vitest";

// This file is about the real module, not the double `setup-common.ts` gives
// every other test.
vi.unmock("@/server/db");

type Listener = (error: Error) => void;

/** As much of a pg client as the pool's `connect` listener touches. */
interface FakeClient {
  on: (event: string, listener: Listener) => void;
}

type PoolListener =
  | [event: "connect", listener: (client: FakeClient) => void]
  | [event: "error", listener: Listener];

interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  onRetry: (error: Error, attempt: number) => void;
}

const LOCAL_URL = "postgresql://app@db.test:5432/app";

const { addBreadcrumb, attachDatabasePool, env, ResilientPool } = vi.hoisted(
  () => ({
    addBreadcrumb: vi.fn(),
    attachDatabasePool: vi.fn(),
    env: {
      DATABASE_URL: "postgresql://app@db.test:5432/app",
      NODE_ENV: "test",
    },
    // Stands in for the pool: records its options and listeners, never connects.
    ResilientPool: vi.fn(
      // oxlint-disable-next-line prefer-arrow-callback -- called with `new`, which an arrow function cannot be
      function ResilientPool(options: unknown, retry: RetryOptions) {
        const listeners: {
          connect?: (client: FakeClient) => void;
          error?: Listener;
        } = {};
        return {
          options,
          retry,
          listeners,
          on: vi.fn((...args: PoolListener) => {
            if (args[0] === "connect") {
              listeners.connect = args[1];
            } else {
              listeners.error = args[1];
            }
          }),
        };
      }
    ),
  })
);

vi.mock("@/server/db/resilient-pool", () => ({ ResilientPool }));
vi.mock("@vercel/functions", () => ({ attachDatabasePool }));
vi.mock("@sentry/nextjs", () => ({ addBreadcrumb }));
vi.mock("@/env", () => ({ env }));

afterEach(() => {
  Reflect.deleteProperty(globalThis, "pool");
  env.DATABASE_URL = LOCAL_URL;
  vi.restoreAllMocks();
});

// Each load evaluates the module afresh, as a new server instance or a dev
// hot reload does.
async function loadDatabase(nodeEnv: string) {
  env.NODE_ENV = nodeEnv;
  vi.resetModules();
  return await import("./index");
}

function createdPool(): ReturnType<typeof ResilientPool> {
  const result = ResilientPool.mock.results.at(-1);

  if (result?.type !== "return") {
    throw new Error("no Pool was created");
  }

  return result.value;
}

/** A loaded module, its pool and the listeners it gave one new connection. */
async function setup() {
  await loadDatabase("test");
  const pool = createdPool();
  const clientListeners = new Map<string, Listener>();

  pool.listeners.connect?.({
    on: (event: string, listener: Listener) => {
      clientListeners.set(event, listener);
    },
  });

  return { clientListeners, pool };
}

describe("database client", () => {
  test("opens one pool on DATABASE_URL with serverless-safe settings", async () => {
    await loadDatabase("test");

    // No `max`: pg's default lets one warm instance serve concurrent requests.
    // No `min`: every idle connection closes before the instance suspends.
    expect(ResilientPool).toHaveBeenCalledExactlyOnceWith(
      {
        connectionString: LOCAL_URL,
        keepAlive: true,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 3000,
      },
      { attempts: 3, baseDelayMs: 200, onRetry: expect.any(Function) }
    );
  });

  test("spells Neon's sslmode=require as the verify-full pg applies", async () => {
    env.DATABASE_URL =
      "postgresql://app@ep-x-pooler.neon.tech/app?sslmode=require";
    await loadDatabase("test");

    expect(createdPool().options).toHaveProperty(
      "connectionString",
      "postgresql://app@ep-x-pooler.neon.tech/app?sslmode=verify-full"
    );
  });

  test("turns a retried connect into a sanitized warning and a breadcrumb", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await loadDatabase("test");

    createdPool().retry.onRetry(
      Object.assign(new Error("Authentication timed out"), { code: "08P01" }),
      2
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        level: "warn",
        action: "Db.connect_retry",
        name: "Error",
        code: "08P01",
        message: "Authentication timed out",
        attempt: 2,
      })
    );
    expect(addBreadcrumb).toHaveBeenCalledExactlyOnceWith({
      category: "db.pool",
      level: "warning",
      message: "Db.connect_retry Error: Authentication timed out",
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
        "announcement",
        "announcementTranslation",
        "attribute",
        "attributeTranslation",
        "attributeValue",
        "attributeValueTranslation",
        "banner",
        "bannerTranslation",
        "category",
        "categoryTranslation",
        "comingSoon",
        "comingSoonTranslation",
        "customerOrder",
        "featuredProduct",
        "homeSection",
        "orderItem",
        "orderStatusEvent",
        "page",
        "pageCoverBanner",
        "pageSection",
        "pageTranslation",
        "product",
        "productAttributeValue",
        "productImage",
        "productImageTranslation",
        "productTranslation",
        "rankingEntry",
        "rateLimit",
        "session",
        "spotlight",
        "spotlightTranslation",
        "store",
        "storeTranslation",
        "user",
        "verification",
      ])
    );
  });

  test("gives every connection a listener that turns its error into a sanitized warning and a breadcrumb", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { clientListeners } = await setup();

    // Without a listener, a client that dies while a request holds it throws
    // its error as an uncaught exception and kills the function.
    expect([...clientListeners.keys()]).toEqual(["error"]);
    clientListeners.get("error")?.(
      Object.assign(
        new Error("Failed query: select 1\nparams: secret-session-token"),
        { code: "08P01" }
      )
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        level: "warn",
        action: "Db.client_error",
        name: "Error",
        code: "08P01",
        message: "Failed query: select 1\nparams: [REDACTED]",
      })
    );
    expect(addBreadcrumb).toHaveBeenCalledExactlyOnceWith({
      category: "db.pool",
      level: "warning",
      message:
        "Db.client_error Error: Failed query: select 1\nparams: [REDACTED]",
    });
  });

  test("listens to the pool's own error without reporting a client's twice", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { clientListeners, pool } = await setup();
    const died = new Error("server conn crashed?");

    // Without a listener, pg-pool throws an idle client's error.
    expect(pool.on.mock.calls.map(([event]) => event)).toEqual([
      "connect",
      "error",
    ]);
    // An idle client's error reaches its own listener, then the pool's.
    clientListeners.get("error")?.(died);
    pool.listeners.error?.(died);

    expect(warn).toHaveBeenCalledOnce();
    expect(addBreadcrumb).toHaveBeenCalledOnce();
  });

  test("reports the error of a client that never finished connecting, which has no listener of its own", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { pool } = await setup();

    pool.listeners.error?.(new Error("Connection terminated unexpectedly"));

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        level: "warn",
        action: "Db.client_error",
        name: "Error",
        message: "Connection terminated unexpectedly",
      })
    );
    expect(addBreadcrumb).toHaveBeenCalledExactlyOnceWith({
      category: "db.pool",
      level: "warning",
      message: "Db.client_error Error: Connection terminated unexpectedly",
    });
  });

  test("reuses the pool across reloads outside production", async () => {
    const first = await loadDatabase("development");
    const second = await loadDatabase("development");

    expect(second.db.$client).toBe(first.db.$client);
    expect(ResilientPool).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ connectionString: LOCAL_URL }),
      expect.any(Object)
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
