import { ORPCError } from "@orpc/client";
import { z } from "zod";

/**
 * The only causes a client may be told. Curated text, never an exception's
 * message, which can carry SQL, row values or file paths: the allowlist is the
 * whole defence, so a new cause is added here or not sent at all.
 */
export const ERROR_WHYS = {
  DATABASE: "A temporary database problem",
  NETWORK: "A connection problem with a service we depend on",
  TIMEOUT: "A service took too long to respond",
} as const;

export type ErrorWhy = (typeof ERROR_WHYS)[keyof typeof ERROR_WHYS];

/**
 * The `data` every typed error carries to the client, declared once on the
 * base builder (`src/server/api/orpc`). It is sent to the browser: never PII,
 * tokens or stacks.
 */
export const appErrorDataSchema = z.object({
  /** Client-safe cause, from {@linkcode ERROR_WHYS} only. */
  why: z.enum(ERROR_WHYS).optional(),
  /** The step that resolves it, shown to the user. */
  fix: z.string().optional(),
  /** The Sentry event the user quotes to support. */
  eventId: z.string().optional(),
  /** The `x-request-id` of the failed request, to find its log line. */
  requestId: z.string().optional(),
  /** The oRPC procedure that failed (`post.create`). */
  procedure: z.string().optional(),
});

export type AppErrorData = z.infer<typeof appErrorDataSchema>;

/** `error` and each of its `cause`s, outermost first; stops on a cycle. */
export function causeChain(error: unknown): object[] {
  const chain: object[] = [];
  let current = error;
  while (
    typeof current === "object" &&
    current !== null &&
    !chain.includes(current)
  ) {
    chain.push(current);
    current = "cause" in current ? current.cause : undefined;
  }
  return chain;
}

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EPIPE",
]);
const TIMEOUT_CODES = new Set(["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"]);

/**
 * The browser's words for "the request never got a response": Chrome's
 * "Failed to fetch", Node's "fetch failed", Firefox's "NetworkError when
 * attempting to fetch resource.", Safari's "Load failed". Anchored, so an app
 * bug that merely mentions fetch is not one; a chunk that failed to load
 * ("Failed to fetch dynamically imported module") is a stale deploy, not the
 * network, and stays an error.
 */
const TRANSPORT_MESSAGE =
  /^(?:failed to fetch(?! dynamically)|fetch failed|networkerror when attempting to fetch|load failed|network error$)/i;

function classifyOne(error: Error): ErrorWhy | undefined {
  // By shape, since neither names itself: Drizzle's failed query keeps its
  // `query` and `params`, the Postgres driver's error carries a `severity`.
  if (("query" in error && "params" in error) || "severity" in error) {
    return ERROR_WHYS.DATABASE;
  }
  const code = "code" in error ? String(error.code) : "";
  if (NETWORK_CODES.has(code)) {
    return ERROR_WHYS.NETWORK;
  }
  if (
    TIMEOUT_CODES.has(code) ||
    error.name === "AbortError" ||
    error.name === "TimeoutError"
  ) {
    return ERROR_WHYS.TIMEOUT;
  }
  if (error.name === "TypeError" && TRANSPORT_MESSAGE.test(error.message)) {
    return ERROR_WHYS.NETWORK;
  }
  return undefined;
}

/**
 * The curated cause of an unexpected error, from the first link of its cause
 * chain that says. `undefined` when none does: a caller never falls back to
 * the error's own message.
 */
export function classifyError(error: unknown): ErrorWhy | undefined {
  for (const link of causeChain(error)) {
    const why = link instanceof Error ? classifyOne(link) : undefined;
    if (why) {
      return why;
    }
  }
  return undefined;
}

/**
 * The request never produced a response (offline, DNS, a dropped connection).
 * An `ORPCError` proves the server answered, so it never is one.
 */
export function isNetworkTransportError(error: unknown): boolean {
  return (
    !(error instanceof ORPCError) && classifyError(error) === ERROR_WHYS.NETWORK
  );
}

/**
 * The correlation ids an `ORPCError` carries. `data` crossed the wire, so each
 * field is checked on its own: a malformed one costs that field only.
 */
export function getErrorData(
  error: unknown
): Pick<AppErrorData, "eventId" | "procedure" | "requestId"> {
  const data: unknown = error instanceof ORPCError ? error.data : undefined;
  if (typeof data !== "object" || data === null) {
    return {};
  }
  return {
    eventId:
      "eventId" in data && typeof data.eventId === "string"
        ? data.eventId
        : undefined,
    procedure:
      "procedure" in data && typeof data.procedure === "string"
        ? data.procedure
        : undefined,
    requestId:
      "requestId" in data && typeof data.requestId === "string"
        ? data.requestId
        : undefined,
  };
}
