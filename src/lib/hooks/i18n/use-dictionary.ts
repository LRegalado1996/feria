import type { Dictionary } from "@/content";

import { useI18n } from "./use-i18n";

/** The interface text of the page's language, for a client component. */
export function useDictionary(): Dictionary {
  return useI18n().dictionary;
}
