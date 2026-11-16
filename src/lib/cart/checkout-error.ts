import { ORPCError } from "@orpc/client";

import type { Dictionary } from "@/content";
import { interpolate } from "@/lib/i18n/interpolate";

/**
 * What a failed order means for the shopper (FER-026):
 * - `stale`: an article changed under the cart (sold out, unpublished):
 *   the cart reads its articles again and says so;
 * - `limited`: too many orders for now, with when to try again;
 * - `refused`: the shop will not take it (a script, a closed store, a
 *   request the server calls malformed); trying again will not help;
 * - `unexpected`: anything else (the network, a server failure), which the
 *   checkout reports; the same submit can be sent again safely.
 */
export type CheckoutFailure = "limited" | "refused" | "stale" | "unexpected";

const SECONDS_PER_MINUTE = 60;

export function checkoutFailure(error: unknown): CheckoutFailure {
  if (!(error instanceof ORPCError)) {
    return "unexpected";
  }

  if (error.code === "TOO_MANY_REQUESTS") {
    return "limited";
  }

  // The server's words for an article the order cannot take (FER-025).
  if (
    error.message === "Article not available" ||
    error.message === "Article not found"
  ) {
    return "stale";
  }

  if (
    error.code === "BAD_REQUEST" ||
    error.code === "FORBIDDEN" ||
    error.code === "NOT_FOUND"
  ) {
    return "refused";
  }

  return "unexpected";
}

/** The minutes until another order is taken, at least one. */
function retryMinutes(error: unknown): number {
  const data: unknown = error instanceof ORPCError ? error.data : null;
  const seconds =
    typeof data === "object" &&
    data !== null &&
    "retryAfter" in data &&
    typeof data.retryAfter === "number"
      ? data.retryAfter
      : SECONDS_PER_MINUTE;

  return Math.max(Math.ceil(seconds / SECONDS_PER_MINUTE), 1);
}

/** The line the checkout shows for `error`, in the page's words. */
export function checkoutErrorMessage(
  error: unknown,
  copy: Dictionary["storefront"]["cart"]["errors"]
): string {
  const failure = checkoutFailure(error);

  if (failure === "limited") {
    return interpolate(copy.tooMany, { minutes: retryMinutes(error) });
  }

  if (failure === "stale") {
    return copy.changed;
  }

  return failure === "refused" ? copy.refused : copy.failed;
}
