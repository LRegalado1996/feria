import { use } from "react";

import { I18nContext, type I18nContextValue } from "@/lib/i18n/provider";

/**
 * The locale and dictionary of the page being rendered. Throws outside
 * `I18nProvider`: falling back to a default language would show a visitor the
 * wrong one without anyone noticing.
 */
export function useI18n(): I18nContextValue {
  const value = use(I18nContext);

  if (!value) {
    throw new Error("useI18n must be used inside an I18nProvider");
  }

  return value;
}
