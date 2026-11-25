import { afterEach, describe, expect, test, vi } from "vitest";

// This file is about the real module, not the double `setup-common.ts` gives
// every other test.
vi.unmock("@/server/db");

type Listener = (error: Error) => void;

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
        const listeners = new Map<string, Listener>();
        return {
          options,
          retry,
          listeners,
          on: vi.fn((event: string, listener: Listener) => {
            listeners.set(event, listener);
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
        connectionTimeoutMillis: 5000,
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
      message:
        "Db.pool_client_error Error: Failed query: select 1\nparams: [REDACTED]",
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
