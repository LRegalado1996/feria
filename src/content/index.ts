import "server-only";
import type { Locale } from "@/lib/i18n/config";

import { en } from "./en";
import { es } from "./es";

export type { Dictionary } from "./es";

const DICTIONARIES = { es, en } satisfies Record<Locale, typeof es>;

/**
 * The interface text of `locale`, for a server component. Server-only: a
 * client component importing this would ship every language to the browser;
 * it reads `useDictionary()` instead, which the root layout feeds.
 */
export function getDictionary(locale: Locale) {
  return DICTIONARIES[locale];
}
