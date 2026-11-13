import { type Mock, vi } from "vitest";

import type { Database } from "@/server/db";

/**
 * Context type used by procedures in production
 */
export interface Context {
  db: Database;
  headers: Headers;
  session: {
    user: {
      id: string;
      email: string;
      name: string;
    };
    session: {
      id: string;
      userId: string;
    };
  } | null;
}

// The type argument is explicit: with a bare `Mock`, a value-returning
// `mockImplementation` reads as `any` and every recorded argument too.
type MockFn = Mock<(...args: unknown[]) => unknown>;

/** A relational model: `findFirst`/`findMany`, and any other method on demand. */
interface MockModel {
  findFirst: MockFn;
  findMany: MockFn;
  [method: string]: MockFn;
}

/**
 * Every query-builder step as a spy, keyed `"<operation>"` or
 * `"<operation>.<method>"`: `$["insert.values"]` is what `.values()` received
 * after `db.insert()`, and `$["insert.returning"]` is what the awaited chain
 * resolves to. The common keys are listed so `noUncheckedIndexedAccess` does
 * not add `| undefined`; any other key works the same way.
 */
interface MockChain {
  delete: MockFn;
  "delete.returning": MockFn;
  "delete.where": MockFn;
  execute: MockFn;
  insert: MockFn;
  "insert.onConflictDoNothing": MockFn;
  "insert.onConflictDoUpdate": MockFn;
  "insert.returning": MockFn;
  "insert.values": MockFn;
  select: MockFn;
  "select.from": MockFn;
  "select.innerJoin": MockFn;
  "select.leftJoin": MockFn;
  "select.limit": MockFn;
  "select.orderBy": MockFn;
  "select.where": MockFn;
  transaction: MockFn;
  update: MockFn;
  "update.returning": MockFn;
  "update.set": MockFn;
  "update.where": MockFn;
  [key: string]: MockFn;
}

/**
 * The Drizzle client as tests drive it: configure and inspect through `query`
 * and `$`. Code under test receives the same object and calls the real API
 * (`db.insert(post).values(...)`, `db.transaction(...)`), which records into
 * those spies. A model added to the schema shows up in `query` on its own.
 */
export interface MockDatabase {
  $: MockChain;
  query: { [Model in keyof Database["query"]]: MockModel };
}

/**
 * Mock context type for testing with a mocked Drizzle client
 */
export interface MockContext {
  db: MockDatabase;
  headers: Headers;
  session: Context["session"];
}

const BUILDER_OPERATIONS = new Set([
  "delete",
  "insert",
  "select",
  "selectDistinct",
  "selectDistinctOn",
  "update",
]);

/**
 * A Drizzle client double built on `Proxy`, so no table, model or chain step
 * has to be listed before a test can use it. Supports:
 * - `db.query.<model>.findFirst/findMany(...)`
 * - `db.insert/update/delete/select…(...)` chains, awaited at any step
 * - `db.transaction(fn)`, which runs `fn` with this same double
 * - `db.execute(sql)`
 *
 * Unconfigured, `findFirst` and `execute` resolve to `undefined` and every
 * row-set read (`findMany`, any chain) to `[]`, so a query a test does not
 * care about reads as "no rows" rather than throwing on destructuring.
 */
export function createMockDatabase(): MockDatabase {
  const spies = new Map<string, MockFn>();

  const spy = (key: string): MockFn => {
    let fn = spies.get(key);

    if (!fn) {
      // `findMany` and every chain step (`$.insert.returning`,
      // `$.select.where`) read a set of rows; `findFirst`, `execute` and a bare
      // operation read a single value.
      const readsRows =
        key.endsWith(".findMany") ||
        (key.startsWith("$.") && key.split(".").length === 3);
      fn = vi.fn<(...args: unknown[]) => unknown>(
        async () => await Promise.resolve(readsRows ? [] : undefined)
      );
      spies.set(key, fn);
    }

    return fn;
  };

  // A chain step returns the next builder; awaiting the builder at any point
  // resolves to what the last step returned.
  const chain = (operation: string, result: unknown): unknown =>
    new Proxy(
      {},
      {
        get(_target, method: string) {
          if (method === "then") {
            const settled = Promise.resolve(result);
            return settled.then.bind(settled);
          }

          return (...args: unknown[]) =>
            chain(operation, spy(`$.${operation}.${method}`)(...args));
        },
      }
    );

  const db: MockDatabase = new Proxy({} as MockDatabase, {
    get(_target, prop: string) {
      if (prop === "query") {
        return new Proxy(
          {},
          {
            get: (_query, model: string) =>
              new Proxy(
                {},
                {
                  get: (_model, method: string) =>
                    spy(`query.${model}.${method}`),
                }
              ),
          }
        );
      }

      if (prop === "$") {
        return new Proxy({}, { get: (_chain, key: string) => spy(`$.${key}`) });
      }

      if (BUILDER_OPERATIONS.has(prop)) {
        return (...args: unknown[]) => chain(prop, spy(`$.${prop}`)(...args));
      }

      if (prop === "transaction" || prop === "execute") {
        return spy(`$.${prop}`);
      }

      return undefined;
    },
  });

  spy("$.transaction").mockImplementation(async (callback: unknown) =>
    typeof callback === "function" ? await callback(db) : undefined
  );

  return db;
}

/**
 * Creates a mock context for unit testing with a mocked Drizzle client.
 *
 * @example
 * ```ts
 * const { mockCtx, ctx } = createMockContext();
 *
 * // A relational query
 * mockCtx.db.query.post.findMany.mockResolvedValue([...]);
 *
 * // What an insert chain resolves to, and what it was given
 * mockCtx.db.$["insert.returning"].mockResolvedValue([{ id: "1" }]);
 * expect(mockCtx.db.$["insert.values"]).toHaveBeenCalledWith({ ... });
 *
 * // Use ctx in your function under test
 * const result = await createUser(input, ctx);
 * ```
 */
export function createMockContext(
  sessionOverrides?: Partial<NonNullable<Context["session"]>>
): { mockCtx: MockContext; ctx: Context } {
  const defaultSession = {
    user: {
      id: "test-user-id",
      email: "test@example.com",
      name: "Test User",
    },
    session: {
      id: "test-session-id",
      userId: "test-user-id",
    },
  };

  const mockCtx: MockContext = {
    db: createMockDatabase(),
    session: sessionOverrides
      ? { ...defaultSession, ...sessionOverrides }
      : defaultSession,
    headers: new Headers(),
  };

  return {
    mockCtx,
    ctx: mockCtx as unknown as Context,
  };
}

/**
 * Creates a mock context with no session (unauthenticated)
 */
export function createUnauthenticatedMockContext(): {
  mockCtx: MockContext;
  ctx: Context;
} {
  const mockCtx: MockContext = {
    db: createMockDatabase(),
    session: null,
    headers: new Headers(),
  };

  return {
    mockCtx,
    ctx: mockCtx as unknown as Context,
  };
}
