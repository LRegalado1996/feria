import { evlogMiddleware } from "evlog/next";

/**
 * Stamps every `/api` request with an `x-request-id` (kept when the caller
 * sent one) and its start time, which the request's wide event and the error
 * reports carry. Nothing else: no database, no auth decision. Real
 * authorization happens per page and per procedure.
 */
export const proxy = evlogMiddleware();

export const config = {
  matcher: ["/api/:path*"],
};
