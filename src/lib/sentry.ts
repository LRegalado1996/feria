// A namespace import, never named ones: `pnpm db:seed` loads this under plain
// Node ESM, which resolves the package's CommonJS build and cannot see its
// named exports, so `import { withScope }` fails before the seed starts.
import * as Sentry from "@sentry/nextjs";

/** Values a capture's `context` may carry: ids, numbers, enums, booleans. */
type ReportableValue = boolean | number | string | null | undefined;

export interface CaptureScope {
  /** Where the failure surfaced, `Domain.snake_action` (`Auth.better_auth_log`). */
  action?: string;
  /** Typed so a caller cannot spread a request body into telemetry. */
  context?: Record<string, ReportableValue>;
  /** The oRPC procedure path (`post.create`). */
  procedure?: string;
  /** The `x-request-id` the proxy stamped, to find the request's log line. */
  requestId?: string;
}

/**
 * The one way server code reports an exception: tagged so it can be found, and
 * returning the event id to show the user as a support code. `null` when
 * Sentry is not initialised (no DSN, or a throwaway preview), never an id the
 * SDK minted for an event it did not send.
 */
export function captureExceptionWithScope(
  error: unknown,
  scope: CaptureScope = {}
): string | null {
  if (!Sentry.getClient()) {
    return null;
  }
  return Sentry.withScope((s) => {
    if (scope.action) {
      s.setTag("action", scope.action);
    }
    if (scope.procedure) {
      s.setTag("procedure", scope.procedure);
    }
    if (scope.requestId) {
      s.setTag("request_id", scope.requestId);
    }
    if (scope.context) {
      s.setContext("details", scope.context);
    }
    return Sentry.captureException(error);
  });
}
