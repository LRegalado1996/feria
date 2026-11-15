import type { Locale } from "@/lib/i18n/config";
import { localizePath, splitLocale } from "@/lib/i18n/paths";

/** A store's sections in the admin, in the order the navigation lists them. */
export const STORE_SECTIONS = [
  "products",
  "categories",
  "orders",
  "home",
  "settings",
  "users",
] as const;

export type StoreSection = (typeof STORE_SECTIONS)[number];

/** The platform's sections, a superadmin's only. */
export const PLATFORM_SECTIONS = ["stores", "users", "metrics"] as const;

export type PlatformSection = (typeof PLATFORM_SECTIONS)[number];

export function isStoreSection(value: string): value is StoreSection {
  return (STORE_SECTIONS as readonly string[]).includes(value);
}

export function isPlatformSection(value: string): value is PlatformSection {
  return (PLATFORM_SECTIONS as readonly string[]).includes(value);
}

export const ADMIN_HOME = "/admin";
export const ADMIN_SIGN_IN = "/admin/sign-in";

export function storeSectionPath(
  storeSlug: string,
  section: StoreSection,
  locale: Locale
): string {
  return localizePath(`/admin/${storeSlug}/${section}`, locale);
}

export function platformSectionPath(
  section: PlatformSection,
  locale: Locale
): string {
  return localizePath(`/admin/platform/${section}`, locale);
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

  // A path that starts with a single slash always parses against an origin.
  const url = new URL(next, PROBE_ORIGIN);
  const { pathname } = splitLocale(url.pathname);
  const inAdmin =
    pathname === ADMIN_HOME || pathname.startsWith(`${ADMIN_HOME}/`);
  const isSignIn =
    pathname === ADMIN_SIGN_IN || pathname.startsWith(`${ADMIN_SIGN_IN}/`);

  return url.origin === PROBE_ORIGIN && inAdmin && !isSignIn
    ? `${url.pathname}${url.search}`
    : fallback;
}
