import type { Locale } from "@/lib/i18n/config";
import { localizePath, splitLocale } from "@/lib/i18n/paths";
import { INT4_MAX } from "@/lib/schemas/catalog";

/**
 * The admin's sections (FER-038: one store, so one list), in the order the
 * navigation lists them: the orders first, where `/admin` opens and where
 * the staff spends the fair (FER-040).
 */
export const ADMIN_SECTIONS = [
  "orders",
  "products",
  "categories",
  "filters",
  "home",
  "settings",
  "users",
  "metrics",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export function isAdminSection(value: string): value is AdminSection {
  return (ADMIN_SECTIONS as readonly string[]).includes(value);
}

export const ADMIN_HOME = "/admin";
export const ADMIN_SIGN_IN = "/admin/sign-in";

/** The section `/admin` opens on, as Lucas chose (FER-038). */
export const ADMIN_LANDING_SECTION: AdminSection = "orders";

export function adminSectionPath(
  section: AdminSection,
  locale: Locale
): string {
  return localizePath(`/admin/${section}`, locale);
}

/** The sign-in page in `locale`, coming back to `returnTo` afterwards. */
export function signInPath(returnTo: string, locale: Locale): string {
  return `${localizePath(ADMIN_SIGN_IN, locale)}?next=${encodeURIComponent(returnTo)}`;
}

// Any origin works: it only tells a relative path from one that leaves.
const PROBE_ORIGIN = "https://admin.invalid";

/**
 * Where to go after signing in: the `next` the sign-in page was given, if it
 * is an admin page of this site, else the admin's landing in `locale`. `next`
 * comes from the URL, so it is attacker-controlled: an absolute or
 * protocol-relative URL (`//evil.example`), a backslash trick, a page
 * outside the admin or the sign-in page itself all fall back.
 */
export function safeReturnPath(next: unknown, locale: Locale): string {
  const fallback = localizePath(ADMIN_HOME, locale);

  if (
    typeof next !== "string" ||
    !next.startsWith("/") ||
    /^[/\\]{2}|\\/u.test(next)
  ) {
    return fallback;
  }

  // The URL parser drops tabs and newlines, so text that passed the checks
  // above can still name an authority it refuses ("/\t/host:bad").
  if (!URL.canParse(next, PROBE_ORIGIN)) {
    return fallback;
  }

  const url = new URL(next, PROBE_ORIGIN);
  const { pathname } = splitLocale(url.pathname);
  const inAdmin =
    pathname === ADMIN_HOME || pathname.startsWith(`${ADMIN_HOME}/`);
  const isSignIn =
    pathname === ADMIN_SIGN_IN || pathname.startsWith(`${ADMIN_SIGN_IN}/`);

  // In the sign-in page's language, like the fallback: a link cannot switch
  // the admin's language by what it puts in `next`.
  return url.origin === PROBE_ORIGIN && inAdmin && !isSignIn
    ? `${localizePath(pathname, locale)}${url.search}`
    : fallback;
}

/**
 * A row's id from a page's address (an order's, an article's), or `null`
 * when the segment cannot be one (not a whole positive number in plain
 * digits, or past what an id column holds), so a made-up address costs no
 * query.
 */
export function readRowId(segment: string): number | null {
  if (!/^[1-9]\d*$/u.test(segment)) {
    return null;
  }

  const id = Number(segment);

  return id <= INT4_MAX ? id : null;
}
