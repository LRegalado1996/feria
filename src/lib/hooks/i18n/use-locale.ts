import type { Locale } from "@/lib/i18n/config";

import { useI18n } from "./use-i18n";

/** The page's language, for formatters and links in a client component. */
export function useLocale(): Locale {
  return useI18n().locale;
}
