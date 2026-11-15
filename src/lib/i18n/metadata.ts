import type { Metadata } from "next";

import { DEFAULT_LOCALE, LOCALES, type Locale } from "./config";
import { localizePath } from "./paths";

/**
 * The canonical URL of a page in `locale` and its `hreflang` alternates: one
 * per language, plus `x-default` for a visitor whose language is neither,
 * which is the default locale. `pathname` is the page's own path, with or
 * without a locale prefix; Next resolves the results against `metadataBase`.
 */
export function buildAlternates(
  pathname: string,
  locale: Locale
): NonNullable<Metadata["alternates"]> {
  return {
    canonical: localizePath(pathname, locale),
    languages: {
      ...Object.fromEntries(
        LOCALES.map((language) => [language, localizePath(pathname, language)])
      ),
      "x-default": localizePath(pathname, DEFAULT_LOCALE),
    },
  };
}
