import type { BetterAuthOptions } from "better-auth";
import { isAPIError } from "better-auth/api";

import { sanitizeForLog } from "@/lib/redaction";
import { captureExceptionWithScope } from "@/lib/sentry";

type BetterAuthLogger = NonNullable<BetterAuthOptions["logger"]>;
type BetterAuthLogLevel = Parameters<NonNullable<BetterAuthLogger["log"]>>[0];

/** `JSON.stringify` throws on a bigint; a log line must not. */
function jsonSafe(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/**
 * Where Better Auth's own diagnostics go instead of its default console
 * output, which prints the raw arguments. When a session lookup fails, the
 * argument is the `DrizzleQueryError` whose message, stack and `params` carry
 * the session token, so every line is sanitized first. One JSON object per
 * line keeps a multi-line stack in a single log entry.
 *
 * `message` is typed as a string by Better Auth, but some of its call sites
 * pass the caught error itself (`logger.error(e)`), so it is sanitized too.
 */
export function writeBetterAuthLog(
  level: BetterAuthLogLevel,
  message: unknown,
  ...args: unknown[]
): void {
  const line = {
    level,
    action: "Auth.better_auth_log",
    message: sanitizeForLog(message),
    ...(args.length > 0 ? { details: sanitizeForLog(args) } : {}),
  };
  console[level](JSON.stringify(line, jsonSafe));
  if (level === "error") {
    reportFailure([message, ...args]);
  }
}

/**
 * An error line also reaches Sentry, once per incident: its first `Error`,
 * scrubbed by `beforeSend` like every event. An `APIError` is skipped. It is
 * Better Auth's own HTTP outcome, and for a 500 Better Auth has already logged
 * the cause on a line of its own, which is the one worth an issue.
 */
function reportFailure(values: unknown[]): void {
  const failure = values.find(
    (value) => value instanceof Error && !isAPIError(value)
  );
  if (failure) {
    captureExceptionWithScope(failure, { action: "Auth.better_auth_log" });
  }
}

export const betterAuthLogger: BetterAuthLogger = { log: writeBetterAuthLog };
