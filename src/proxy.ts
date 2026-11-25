import { evlogMiddleware } from "evlog/next";
import { type NextRequest, NextResponse } from "next/server";

import {
  COMING_SOON_PATH,
  STORE_PREVIEW_COOKIE,
} from "@/lib/coming-soon/paths";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { localizePath, splitLocale } from "@/lib/i18n/paths";
import { captureExceptionWithScope } from "@/lib/sentry";
import { within } from "@/lib/utils/within";
import { isAdminRequest } from "@/server/better-auth/admin-request";
import {
  isStorefrontClosed,
  SWITCH_TIMEOUT_MS,
} from "@/server/cache/storefront-switch";

/**
 * Stamps an `/api` request with an `x-request-id` (kept when the caller sent
 * one) and its start time, which the request's wide event and the error
 * reports carry.
 */
const stampApiRequest = evlogMiddleware();

const PERMANENT_REDIRECT = 308;
// Temporary on purpose: a search engine keeps the address it asked for and
// comes back to it, which is right for a store that is closed for a while.
const TEMPORARY_REDIRECT = 307;

/** The admin stays reachable while the store is closed, to load the catalog. */
function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Whether a signed-in admin made the request: a session the database
 * vouches for (`isAdminRequest`), never a cookie's presence. A check that
 * fails or outlasts the switch's own limit is reported and answers no, so an
 * outage shows the admin what the public sees instead of opening the store to
 * someone it could not check, and a stalled database holds a page no longer
 * than the switch read does.
 */
async function fromAdmin(request: NextRequest): Promise<boolean> {
  try {
    return await within(
      isAdminRequest(request.headers),
      SWITCH_TIMEOUT_MS,
      "The admin session check"
    );
  } catch (error) {
    captureExceptionWithScope(error, { action: "ComingSoon.check_admin" });

    return false;
  }
}

/** What the coming-soon switch does with a page request. */
type LaunchDecision =
  | { redirectTo: string }
  /** Let through; `preview` when an admin sees the closed store. */
  | { preview: boolean };

/**
 * The coming-soon switch (FER-034), read from the database
 * (`isStorefrontClosed`, closed when it cannot be read). Published, every
 * address but the admin and the coming-soon page leads to that page, in the
 * language of the address, except for a signed-in admin, who sees the store
 * with a notice. Unpublished, the store is open and the coming-soon page
 * leads home, except for an admin, who may preview it. The admin's pages
 * never wait for any of this.
 */
async function decideLaunch(
  request: NextRequest,
  { locale, pathname }: ReturnType<typeof splitLocale>
): Promise<LaunchDecision> {
  if (isAdminPath(pathname)) {
    return { preview: false };
  }

  const language = locale ?? DEFAULT_LOCALE;
  const comingSoon = pathname === COMING_SOON_PATH;

  if (await isStorefrontClosed()) {
    if (comingSoon) {
      return { preview: false };
    }

    return (await fromAdmin(request))
      ? { preview: true }
      : { redirectTo: localizePath(COMING_SOON_PATH, language) };
  }

  if (comingSoon && !(await fromAdmin(request))) {
    return { redirectTo: localizePath("/", language) };
  }

  return { preview: false };
}

/** Where the language rules send a page request the switch let through. */
function routeByLanguage(
  request: NextRequest,
  { locale, pathname: bare }: ReturnType<typeof splitLocale>
): NextResponse {
  const { pathname } = request.nextUrl;

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

/**
 * Three jobs. `/api` requests are stamped for logging. Every page request
 * passes the coming-soon switch first (`decideLaunch`), the one access
 * decision made here, on a session the proxy validates itself. Then it gets
 * its language from the URL: pages live under `app/[locale]`, Spanish is
 * served without a prefix and English under `/en`. So an unprefixed path is
 * rewritten to its Spanish route (the address bar keeps the short URL),
 * `/en/...` passes through, and `/es/...` redirects to the unprefixed URL so
 * each Spanish page has exactly one address. Everything else (who may use
 * the admin and the API) is decided per page and per procedure.
 *
 * What an admin sees of the closed store is the same server output the
 * public would get: the notice is drawn in the browser from a cookie set
 * here (`STORE_PREVIEW_COOKIE`), so no cache ever holds a page that differs
 * by who asked, and the proxy runs before every cache, so a closed store's
 * cached pages never reach the public.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return await stampApiRequest(request);
  }

  const split = splitLocale(pathname);
  const decision = await decideLaunch(request, split);

  if ("redirectTo" in decision) {
    return withPreviewCookie(
      request,
      launchRedirect(request, decision.redirectTo),
      false
    );
  }

  // The admin's pages leave the notice as it was: they show none.
  return isAdminPath(split.pathname)
    ? routeByLanguage(request, split)
    : withPreviewCookie(
        request,
        routeByLanguage(request, split),
        decision.preview
      );
}

/** The switch's temporary redirect, which no cache may keep. */
function launchRedirect(request: NextRequest, target: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = target;
  // The query belonged to the page that was asked for, not to this one.
  url.search = "";

  const response = NextResponse.redirect(url, TEMPORARY_REDIRECT);
  // It depends on the switch and on who asked.
  response.headers.set("cache-control", "private, no-store");

  return response;
}

/**
 * Sets the notice's cookie on a page an admin sees while the store is
 * closed, and clears it from any other page response that still carries it.
 * Set on a response, it also keeps a shared cache from storing that response.
 */
function withPreviewCookie(
  request: NextRequest,
  response: NextResponse,
  preview: boolean
): NextResponse {
  if (preview) {
    response.cookies.set(STORE_PREVIEW_COOKIE, "1", {
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  } else if (request.cookies.has(STORE_PREVIEW_COOKIE)) {
    response.cookies.delete(STORE_PREVIEW_COOKIE);
  }

  return response;
}

export const config = {
  // Everything except what never has a language: Next's own assets, Vercel's
  // endpoints, BotID's script and checks (FER-026: `withBotId` rewrites them
  // after the proxy, which would otherwise send them to `/es/...` and a 404),
  // the Sentry tunnel, the brand's icons (`/favicon.ico`, `/icon.png`,
  // `/apple-icon.png`: rewritten to `/es/...`, the storefront would answer
  // a page where a crawler expects an image) and the files in `public/`, by
  // name or by folder: IndexNow's key file is 32 hex characters and `.txt`
  // at the root, its name the key, so the pattern says that much and no
  // more. The share card is generated per language
  // (`app/[locale]/opengraph-image.tsx`) and is an image, not a page: its
  // Spanish URL keeps the `/es` a page would be redirected away from, so a
  // crawler gets it in one request. `robots.txt` and `sitemap.xml` are
  // site-wide metadata routes at the root: rewritten to `/es/...` they would
  // be a 404, and redirected to the coming-soon page while the store is
  // closed, a crawler would read no rules at all. A blanket "anything with a
  // dot" would also skip pages (`/productos/2.5mm`) and API routes
  // (`/api/docs/spec.json`); a test holds this list to `public/` and to the
  // languages, so a new file or language fails until it is added.
  matcher: [
    "/((?!_next/|_vercel/|149e9513-01fa-4fb0-aad4-566afd725d1b/|monitoring(?:/|$)|brand/|seed/|(?:favicon\\.ico|icon\\.png|apple-icon\\.png)$|(?:robots\\.txt|sitemap\\.xml)$|[0-9a-f]{32}\\.txt$|(?:es|en)/opengraph-image$).*)",
  ],
};
