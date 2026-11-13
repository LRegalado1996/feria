/**
 * The languages the product speaks, as they appear in the URL and in
 * `<html lang>`. The regional tag each one formats numbers and dates with
 * lives in `src/lib/utils/format.ts`.
 */
export const LOCALES = ["es", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** Served without a prefix: `/` is Spanish and `/en` is English. */
export const DEFAULT_LOCALE = "es" satisfies Locale;

/** Narrows a URL segment or a route param, which can be any string. */
export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value);
}
