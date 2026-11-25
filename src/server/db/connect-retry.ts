/**
 * Socket errors from opening a connection that a second attempt can clear:
 * the peer reset or refused it, the route or the name lookup hiccuped.
 */
const TRANSIENT_SOCKET_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
]);

/**
 * Postgres refusing a connection for now: an administrator or crash shutdown,
 * or a server still starting (Neon waking a suspended compute).
 */
const TRANSIENT_SQLSTATES = new Set(["57P01", "57P02", "57P03"]);

/**
 * What node-postgres says when a connection dies while it is being opened:
 * the pool's own connect timeout fired, or the server or the network closed
 * the socket mid-handshake.
 */
const TRANSIENT_MESSAGES = new Set([
  "Connection terminated due to connection timeout",
  "Connection terminated unexpectedly",
]);

function codeOf(error: Error): unknown {
  return "code" in error ? error.code : undefined;
}

/**
 * Whether opening a connection failed in a way worth one more try. Class 08
 * is Postgres's connection exception, where Neon's proxy files "Authentication
 * timed out" (08P01). Wrong credentials (28P01), a missing database (3D000)
 * and the pool's own "timeout exceeded when trying to connect" (every
 * connection busy: another attempt only adds load) are not: they fail again.
 */
export function isTransientConnectError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = codeOf(error);

  if (typeof code === "string") {
    return (
      code.startsWith("08") ||
      TRANSIENT_SQLSTATES.has(code) ||
      TRANSIENT_SOCKET_CODES.has(code)
    );
  }

  return TRANSIENT_MESSAGES.has(error.message);
}

/**
 * How long one attempt to open a connection may take. Neon usually answers
 * in under a second, even waking a suspended compute; the proxy, which runs
 * in the region nearest the visitor, pays its distance to the database on
 * every round trip of the handshake as well. An attempt stuck this long is
 * dead, and a new one beats waiting on it: short enough that whoever bounds
 * a read (the storefront switch) still has time for the retry.
 *
 * pg-pool gives a request waiting for a free connection the same limit
 * (every connection busy): that one fails with "timeout exceeded when trying
 * to connect" and is not retried.
 */
export const CONNECT_TIMEOUT_MS = 3000;

/** The pool's retry of a connection that failed to open. */
export const CONNECT_RETRY = { attempts: 3, baseDelayMs: 200 } as const;

export interface ConnectRetryOptions {
  /** Tries in all, the first included. */
  attempts: number;
  /** The wait before the second try; it doubles before each later one. */
  baseDelayMs: number;
  /** Called before each wait, with the failure it retries (1-based). */
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Half the backoff fixed, half random: instances that lost their connections
 * together (one compute suspended under all of them) do not all knock again
 * on the same millisecond, and none retries at once into the same failure.
 */
function backoffMs(baseDelayMs: number, attempt: number): number {
  const ceiling = baseDelayMs * 2 ** (attempt - 1);

  return ceiling / 2 + Math.random() * (ceiling / 2);
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Runs `connect` again after a short backoff while it fails transiently. Only
 * for opening a connection: no statement has been sent yet, so a retry can
 * never run a query twice. Any other failure, or the last attempt's, is
 * thrown as it came.
 */
export async function connectWithRetry<T>(
  connect: () => Promise<T>,
  options: ConnectRetryOptions,
  attempt = 1
): Promise<T> {
  try {
    return await connect();
  } catch (error) {
    if (attempt >= options.attempts || !isTransientConnectError(error)) {
      throw error;
    }

    options.onRetry?.(error, attempt);
    await wait(backoffMs(options.baseDelayMs, attempt));

    return await connectWithRetry(connect, options, attempt + 1);
  }
}
