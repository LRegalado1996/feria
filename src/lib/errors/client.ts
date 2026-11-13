import { ORPCError } from "@orpc/client";
import {
  addBreadcrumb,
  captureException,
  getClient,
  withScope,
} from "@sentry/nextjs";

import { getErrorData, isNetworkTransportError } from "@/lib/errors";
import { isBusinessError } from "@/lib/sentry-options";

/** Ids, numbers, enums, booleans: the type stops a form body reaching telemetry. */
type ReportableValue = boolean | number | string | null | undefined;

interface ReportOptions {
  /** `Domain.snake_action`, the tag alerts filter on (`Post.create_failed`). */
  action: string;
  context?: Record<string, ReportableValue>;
}

/**
 * The one way client code reports a caught error. It always leaves an action
 * breadcrumb, so the next real error carries what the user was doing. A typed
 * business `ORPCError` and a request that never got a response stop there:
 * neither is a defect. Anything else becomes an event tagged with the
 * correlation ids the server put in `error.data`.
 *
 * Returns the Sentry event id to show as a support code, or `null` when no
 * event was sent: never an id the SDK minted without a client to send it.
 */
export function reportError(
  error: unknown,
  { action, context }: ReportOptions
): string | null {
  const network = isNetworkTransportError(error);
  addBreadcrumb({
    category: "action",
    level: network ? "warning" : "info",
    message: action,
    data: {
      ...context,
      ...(error instanceof ORPCError ? { code: String(error.code) } : {}),
    },
  });

  if (network || isBusinessError(error) || !getClient()) {
    return null;
  }

  const { eventId, procedure, requestId } = getErrorData(error);
  return withScope((scope) => {
    scope.setTag("action", action);
    if (procedure) {
      scope.setTag("procedure", procedure);
    }
    if (requestId) {
      scope.setTag("request_id", requestId);
    }
    // The server's own event for this failure: links the two reports.
    if (eventId) {
      scope.setTag("server_event_id", eventId);
    }
    if (context) {
      scope.setContext("details", context);
    }
    return captureException(error);
  });
}
