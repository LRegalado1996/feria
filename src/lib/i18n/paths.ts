import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

const LEADING_SLASHES = /^\/+/;

/**
 * One leading slash, never two: a path that starts with `//` is, as an
 * `href`, a link to another host.
 */
function toSameOriginPath(pathname: string): string {
  return pathname.replace(LEADING_SLASHES, "/");
}

/**
 * Splits a pathname into its locale prefix and the rest. Only a whole first
 * segment counts: `/en/cart` is English, `/english` has no prefix.
 */
export function splitLocale(pathname: string): {
  locale: Locale | null;
  pathname: string;
} {
  const [, first, ...rest] = pathname.split("/");

  if (!isLocale(first)) {
    return { locale: null, pathname };
  }

  return { locale: first, pathname: toSameOriginPath(`/${rest.join("/")}`) };
}

/**
 * The same page in `locale`: any prefix the pathname carries is dropped, then
 * the default locale gets none and every other locale its own (`/en`, never
 * `/en/`). Idempotent, so it is safe on a path that is already localized. The
 * result always stays on this origin, whatever the pathname it was given.
 */
export function localizePath(pathname: string, locale: Locale): string {
  const bare = toSameOriginPath(splitLocale(pathname).pathname);

  if (locale === DEFAULT_LOCALE) {
    return bare;
  }

  return bare === "/" ? `/${locale}` : `/${locale}${bare}`;
}
