import { ORPCError } from "@orpc/client";

/**
 * `null` for a NOT_FOUND, so an RSC page can call `notFound()`; every other
 * failure propagates to the error boundary and Sentry. A blanket
 * `.catch(() => null)` around a `caller` would show an outage as a 404.
 */
export async function catchNotFound<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") {
      return null;
    }
    throw error;
  }
}
