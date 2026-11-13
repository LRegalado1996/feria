import { evlogMiddleware } from "evlog/next";
import { type NextRequest, NextResponse } from "next/server";

import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { splitLocale } from "@/lib/i18n/paths";

/**
 * Stamps an `/api` request with an `x-request-id` (kept when the caller sent
 * one) and its start time, which the request's wide event and the error
 * reports carry.
 */
const stampApiRequest = evlogMiddleware();

const PERMANENT_REDIRECT = 308;

/**
 * Two jobs, and no database or auth decision in either: real authorization
 * happens per page and per procedure.
 *
 * `/api` requests are stamped for logging. Every page request gets its
 * language from the URL: pages live under `app/[locale]`, Spanish is served
 * without a prefix and English under `/en`. So an unprefixed path is rewritten
 * to its Spanish route (the address bar keeps the short URL), `/en/...` passes
 * through, and `/es/...` redirects to the unprefixed URL so each Spanish page
 * has exactly one address.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return await stampApiRequest(request);
  }

  const { locale, pathname: bare } = splitLocale(pathname);

  if (locale === null) {
    const url = request.nextUrl.clone();
    url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;

    return NextResponse.rewrite(url);
  }

  if (locale === DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = bare;

    return NextResponse.redirect(url, PERMANENT_REDIRECT);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except what never has a language: Next's own assets, Vercel's
  // endpoints, the Sentry tunnel and any path with a file extension (the
  // favicon, files in `public/`).
  matcher: ["/((?!_next/|_vercel/|monitoring|.*\\..*).*)"],
};
