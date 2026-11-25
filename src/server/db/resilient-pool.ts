import { AsyncLocalStorage } from "node:async_hooks";

import { Pool } from "pg";
import type { PoolClient, PoolConfig } from "pg";

import { connectWithRetry } from "./connect-retry";
import type { ConnectRetryOptions } from "./connect-retry";

type ConnectCallback = Parameters<Pool["connect"]>[0];

const singleAttempt = new AsyncLocalStorage<true>();

/**
 * Runs `run` with every connection it opens tried once, never retried: for
 * the health probe, whose job is to see the outage a retry would hide.
 */
export async function withSingleConnectAttempt<T>(
  run: () => Promise<T>
): Promise<T> {
  return await singleAttempt.run(true, run);
}

/** Whether the code running now is inside `withSingleConnectAttempt`. */
export function isSingleConnectAttempt(): boolean {
  return singleAttempt.getStore() === true;
}

function noop(): void {
  // The release handle of a connection that was never handed out.
}

/** Settles a checkout into pg's callback form: the error, or the client. */
async function handOut(
  connected: Promise<PoolClient>,
  callback: ConnectCallback
): Promise<void> {
  let client: PoolClient;
  try {
    client = await connected;
  } catch (error) {
    callback(
      error instanceof Error ? error : new Error(String(error)),
      undefined,
      noop
    );
    return;
  }

  callback(undefined, client, (release?: boolean | Error) => {
    client.release(release);
  });
}

/**
 * A pg pool that retries opening a connection when it fails transiently.
 *
 * Every statement goes through `connect`: `pool.query` (each Drizzle query
 * outside a transaction) checks a client out with it, and a transaction
 * calls it directly. A failure here comes before any statement is sent, so
 * the retry cannot run one twice. A query that fails on a connection it
 * already holds is not retried: it may have run.
 */
export class ResilientPool extends Pool {
  readonly #retry: ConnectRetryOptions;

  constructor(config: PoolConfig, retry: ConnectRetryOptions) {
    super(config);
    this.#retry = retry;
  }

  override connect(): Promise<PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(
    callback?: ConnectCallback
  ): Promise<PoolClient> | undefined {
    const connected = connectWithRetry(
      async () => await super.connect(),
      isSingleConnectAttempt() ? { ...this.#retry, attempts: 1 } : this.#retry
    );

    if (!callback) {
      return connected;
    }

    // pg-pool's own `query` takes the callback form.
    void handOut(connected, callback);

    return undefined;
  }
}
