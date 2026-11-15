import { evlogMiddleware } from "evlog/next";
import { type NextRequest, NextResponse } from "next/server";

import {
  COMING_SOON_PATH,
  isStorefrontLaunchedFor,
  LAUNCH_OVERRIDE_HEADER,
} from "@/lib/env/launch";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { localizePath, splitLocale } from "@/lib/i18n/paths";

/**
 * Stamps an `/api` request with an `x-request-id` (kept when the caller sent
 * one) and its start time, which the request's wide event and the error
 * reports carry.
 */
const stampApiRequest = evlogMiddleware();

const PERMANENT_REDIRECT = 308;
// Temporary on purpose: a search engine keeps the address it asked for and
// comes back to it, which is right for a store that opens in a few weeks.
const TEMPORARY_REDIRECT = 307;

/** The admin stays reachable while the store is closed, to load the catalog. */
function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Where the launch switch sends a page request, or `null` to let it through.
 * Closed, every address but the admin and the coming-soon page itself leads
 * to that page, in the language of the address. Open, the coming-soon page
 * leads home: it must not outlive the launch in someone's bookmarks.
 */
function resolveLaunchRedirect(request: NextRequest): string | null {
  const { locale, pathname } = splitLocale(request.nextUrl.pathname);
  const language = locale ?? DEFAULT_LOCALE;
  const launched = isStorefrontLaunchedFor(
    request.headers.get(LAUNCH_OVERRIDE_HEADER)
  );

  if (pathname === COMING_SOON_PATH) {
    return launched ? localizePath("/", language) : null;
  }

  return launched || isAdminPath(pathname)
    ? null
    : localizePath(COMING_SOON_PATH, language);
}

/**
 * Three jobs, and no database or auth decision in any: real authorization
 * happens per page and per procedure.
 *
 * `/api` requests are stamped for logging. Every page request gets its
 * language from the URL: pages live under `app/[locale]`, Spanish is served
 * without a prefix and English under `/en`. So an unprefixed path is rewritten
 * to its Spanish route (the address bar keeps the short URL), `/en/...` passes
 * through, and `/es/...` redirects to the unprefixed URL so each Spanish page
 * has exactly one address.
 *
 * Before that, the launch switch (`src/lib/env/launch.ts`): until the store
 * opens, page requests are redirected to the coming-soon page. The API, the
 * health check and the admin are never behind it.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return await stampApiRequest(request);
  }

  const launchRedirect = resolveLaunchRedirect(request);

  if (launchRedirect !== null) {
    const url = request.nextUrl.clone();
    url.pathname = launchRedirect;
    // The query belonged to the page that was asked for, not to this one.
    url.search = "";

    return NextResponse.redirect(url, TEMPORARY_REDIRECT);
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
  // endpoints, the Sentry tunnel, the generated brand images and the files in
  // `public/`, by name or by folder. The share card is generated per language
  // (`app/[locale]/opengraph-image.tsx`) and is an image, not a page: its
  // Spanish URL keeps the `/es` a page would be redirected away from, so a
  // crawler gets it in one request. A blanket "anything with a dot" would
  // also skip pages (`/products/2.5mm`) and API routes
  // (`/api/docs/spec.json`); a test holds this list to `public/` and to the
  // languages, so a new file or language fails until it is added.
  matcher: [
    "/((?!_next/|_vercel/|monitoring(?:/|$)|brand/|(?:icon|apple-icon)$|(?:es|en)/opengraph-image$).*)",
  ],
};
