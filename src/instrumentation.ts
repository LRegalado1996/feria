import { captureRequestError, withIsolationScope } from "@sentry/nextjs";
import type { Instrumentation } from "next";

import { isBusinessError } from "@/lib/sentry-options";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
}

function readDigest(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return undefined;
  }
  return typeof error.digest === "string" ? error.digest : undefined;
}

/**
 * Server errors Next caught (render, route handler, action, proxy). A typed
 * business `ORPCError` an RSC let escape is the page answering as designed, so
 * it is skipped by code. The rest is tagged with where it happened, on an
 * isolation scope so one request's tags never reach the next one's events; the
 * digest tag is what finds the event a user quotes from an error page.
 */
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context
) => {
  if (isBusinessError(error)) {
    return;
  }
  withIsolationScope((scope) => {
    scope.setTags({
      digest: readDigest(error),
      route_path: context.routePath,
      route_type: context.routeType,
    });
    captureRequestError(error, request, context);
  });
};
