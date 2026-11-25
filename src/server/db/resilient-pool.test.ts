import { Client, Pool } from "pg";
import type { PoolClient } from "pg";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  isSingleConnectAttempt,
  ResilientPool,
  withSingleConnectAttempt,
} from "./resilient-pool";

const TIMEOUT = new Error("Connection terminated due to connection timeout");
const DENIED = Object.assign(new Error("password authentication failed"), {
  code: "28P01",
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** pg's callback form of `connect`, as `pool.query` passes it. */
type ConnectCallback = (
  error: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: boolean | Error) => void
) => void;

/**
 * pg's prototype seen through its promise overload only, so the double's
 * type is the one the subclass calls (`super.connect()`). Same object.
 */
const pgPool: { connect: () => Promise<PoolClient> } = Pool.prototype;

/**
 * A pool over pg's real one whose checkouts fail with each of `failures` in
 * turn, then hand out `client`. Nothing connects: pg's own `connect` is the
 * double, so these tests see what the subclass adds to it.
 */
function setup(failures: Error[]) {
  const release = vi.fn<(error?: boolean | Error) => void>();
  // A real client that never connects, with the release the pool adds.
  const client = Object.assign(new Client(), { release });
  const queue = [...failures];
  const checkout = vi.spyOn(pgPool, "connect").mockImplementation(async () => {
    const failure = queue.shift();
    if (failure) {
      throw failure;
    }
    return await Promise.resolve(client);
  });
  const onRetry = vi.fn<(error: Error, attempt: number) => void>();
  const pool = new ResilientPool(
    { connectionString: "postgresql://app@db.test/app", max: 4 },
    { attempts: 3, baseDelayMs: 0, onRetry }
  );

  return { checkout, client, onRetry, pool, release };
}

/** Connects in the callback form and answers what the callback got. */
async function connectByCallback(pool: ResilientPool) {
  const callback = vi.fn<ConnectCallback>();
  pool.connect(callback);
  await vi.waitFor(() => {
    expect(callback).toHaveBeenCalledOnce();
  });

  const call = callback.mock.calls[0];
  if (!call) {
    throw new Error("the callback was not called");
  }

  const [error, client, done] = call;
  return { client, done, error };
}

describe("ResilientPool", () => {
  test("is a pg pool built on the given config", () => {
    const { pool } = setup([]);

    expect(pool).toBeInstanceOf(Pool);
    expect(pool.options.max).toBe(4);
  });

  test("a checkout that fails transiently is retried and hands out the client", async () => {
    const { checkout, client, onRetry, pool } = setup([TIMEOUT]);

    await expect(pool.connect()).resolves.toBe(client);
    expect(checkout).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledExactlyOnceWith(TIMEOUT, 1);
  });

  test("inside a single-attempt scope a transient failure is not retried", async () => {
    const { checkout, onRetry, pool } = setup([TIMEOUT]);

    await expect(
      withSingleConnectAttempt(async () => await pool.connect())
    ).rejects.toBe(TIMEOUT);
    expect(checkout).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });

  test("the single-attempt scope covers only what runs in it", async () => {
    const { client, pool } = setup([]);

    expect(isSingleConnectAttempt()).toBe(false);
    await expect(
      withSingleConnectAttempt(async () => {
        expect(isSingleConnectAttempt()).toBe(true);
        return await pool.connect();
      })
    ).resolves.toBe(client);
    expect(isSingleConnectAttempt()).toBe(false);
  });

  test("a permanent failure is not retried", async () => {
    const { checkout, pool } = setup([DENIED]);

    await expect(pool.connect()).rejects.toBe(DENIED);
    expect(checkout).toHaveBeenCalledOnce();
  });

  test("the callback form, pg's own `query` path, gets the client and its release", async () => {
    const { client, pool, release } = setup([TIMEOUT]);

    const { client: handedOut, done, error } = await connectByCallback(pool);

    expect(error).toBeUndefined();
    expect(handedOut).toBe(client);

    // The third argument releases that client, passing on what it is given.
    const broken = new Error("broken");
    done(broken);
    expect(release).toHaveBeenCalledExactlyOnceWith(broken);
  });

  test("the callback form gets the failure, no client and a harmless release", async () => {
    const { pool, release } = setup([DENIED]);

    const { client, done, error } = await connectByCallback(pool);

    expect(error).toBe(DENIED);
    expect(client).toBeUndefined();
    expect(() => {
      done();
    }).not.toThrow();
    expect(release).not.toHaveBeenCalled();
  });

  test("the callback form wraps a thrown value that is no Error", async () => {
    const { checkout, pool } = setup([]);
    checkout.mockRejectedValueOnce("socket gone");

    const { error } = await connectByCallback(pool);

    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty("message", "socket gone");
  });

  test("pg's `query` checks out through the retrying connect and sends its statement once", async () => {
    const { checkout, client, pool, release } = setup([TIMEOUT]);
    const query = vi.fn(
      (
        _text: string,
        _values: unknown,
        done: (error?: Error, result?: unknown) => void
      ) => {
        done(undefined, { rows: [{ ok: 1 }] });
      }
    );
    Object.assign(client, { query });

    await expect(pool.query("select $1::int as ok", [1])).resolves.toEqual({
      rows: [{ ok: 1 }],
    });
    // Two checkouts, the retried one included; the statement only once, on
    // the client the second one handed out, which goes back to the pool.
    expect(checkout).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      "select $1::int as ok",
      [1],
      expect.any(Function)
    );
    expect(release).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});
