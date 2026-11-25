import { afterEach, describe, expect, test, vi } from "vitest";

import { connectWithRetry, isTransientConnectError } from "./connect-retry";

/** An error as node-postgres or Node raises it: a message and maybe a code. */
function driverError(message: string, code?: string): Error {
  return Object.assign(new Error(message), code === undefined ? {} : { code });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isTransientConnectError", () => {
  test.each([
    [
      "the pool's connect timeout",
      driverError("Connection terminated due to connection timeout"),
    ],
    [
      "a socket closed mid-handshake",
      driverError("Connection terminated unexpectedly"),
    ],
    [
      "Neon's proxy timing out authentication",
      driverError("Authentication timed out", "08P01"),
    ],
    [
      "another connection exception",
      driverError("connection failure", "08006"),
    ],
    [
      "an administrator shutdown",
      driverError("terminating connection", "57P01"),
    ],
    ["a crash shutdown", driverError("terminating connection", "57P02")],
    [
      "a server still starting",
      driverError("the database system is starting up", "57P03"),
    ],
    ["a reset socket", driverError("read ECONNRESET", "ECONNRESET")],
    ["a refused socket", driverError("connect ECONNREFUSED", "ECONNREFUSED")],
    ["a timed-out socket", driverError("connect ETIMEDOUT", "ETIMEDOUT")],
    ["a broken pipe", driverError("write EPIPE", "EPIPE")],
    ["a name lookup hiccup", driverError("getaddrinfo EAI_AGAIN", "EAI_AGAIN")],
    [
      "an unreachable host",
      driverError("connect EHOSTUNREACH", "EHOSTUNREACH"),
    ],
    [
      "an unreachable network",
      driverError("connect ENETUNREACH", "ENETUNREACH"),
    ],
  ])("%s is worth another try", (_case, error) => {
    expect(isTransientConnectError(error)).toBe(true);
  });

  test.each([
    [
      "wrong credentials",
      driverError("password authentication failed", "28P01"),
    ],
    ["a missing database", driverError('database "x" does not exist', "3D000")],
    ["a query error", driverError("syntax error", "42601")],
    [
      "every connection busy",
      driverError("timeout exceeded when trying to connect"),
    ],
    [
      "a used-up pool",
      driverError("Cannot use a pool after calling end on the pool"),
    ],
    // The code decides: a known message under an unknown code is not retried.
    [
      "a known message under a permanent code",
      driverError("Connection terminated unexpectedly", "28000"),
    ],
    ["a value that is no error", "Connection terminated unexpectedly"],
  ])("%s is not", (_case, error) => {
    expect(isTransientConnectError(error)).toBe(false);
  });
});

/** A connect that fails with each of `failures` in turn, then succeeds. */
function setup(failures: Error[]) {
  vi.useFakeTimers();
  // The jitter at its top: each wait is its whole ceiling.
  vi.spyOn(Math, "random").mockReturnValue(1);
  const queue = [...failures];
  const connect = vi.fn(async () => {
    const failure = queue.shift();
    if (failure !== undefined) {
      throw failure;
    }
    return await Promise.resolve("client");
  });
  const onRetry = vi.fn<(error: Error, attempt: number) => void>();

  return {
    connect,
    onRetry,
    options: { attempts: 3, baseDelayMs: 200, onRetry },
  };
}

const TIMEOUT = driverError("Connection terminated due to connection timeout");
const AUTH_TIMEOUT = driverError("Authentication timed out", "08P01");

describe("connectWithRetry", () => {
  test("a connect that works is called once", async () => {
    const { connect, onRetry, options } = setup([]);

    await expect(connectWithRetry(connect, options)).resolves.toBe("client");
    expect(connect).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });

  test("a transient failure is retried after a backoff that doubles", async () => {
    const { connect, onRetry, options } = setup([TIMEOUT, AUTH_TIMEOUT]);

    const connected = connectWithRetry(connect, options);
    await vi.advanceTimersByTimeAsync(0);
    expect(connect).toHaveBeenCalledOnce();

    // First wait: the 200 ms ceiling.
    await vi.advanceTimersByTimeAsync(199);
    expect(connect).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(2);

    // Second wait: 400 ms.
    await vi.advanceTimersByTimeAsync(399);
    expect(connect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(connected).resolves.toBe("client");
    expect(connect).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls).toEqual([
      [TIMEOUT, 1],
      [AUTH_TIMEOUT, 2],
    ]);
  });

  test("the jitter waits at least half the ceiling", async () => {
    const { connect, options } = setup([TIMEOUT]);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const connected = connectWithRetry(connect, options);
    await vi.advanceTimersByTimeAsync(99);
    expect(connect).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(connected).resolves.toBe("client");
  });

  test("the last attempt's failure is thrown as it came", async () => {
    const third = driverError("Connection terminated unexpectedly");
    const { connect, onRetry, options } = setup([TIMEOUT, TIMEOUT, third]);

    // Settled into a value at once, so the rejection is never left unhandled
    // while the timers run.
    const settled = connectWithRetry(connect, options).then(
      () => "resolved",
      (error: unknown) => error
    );
    await vi.runAllTimersAsync();

    await expect(settled).resolves.toBe(third);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  test("a permanent failure is thrown at once, without a retry", async () => {
    const denied = driverError("password authentication failed", "28P01");
    const { connect, onRetry, options } = setup([denied]);

    await expect(connectWithRetry(connect, options)).rejects.toBe(denied);
    expect(connect).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });

  test("works without an onRetry listener", async () => {
    const { connect } = setup([TIMEOUT]);

    const connected = connectWithRetry(connect, {
      attempts: 2,
      baseDelayMs: 10,
    });
    await vi.runAllTimersAsync();

    await expect(connected).resolves.toBe("client");
  });
});
