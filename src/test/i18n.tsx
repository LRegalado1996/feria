import {
  type RenderOptions,
  type RenderResult,
  render,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { en } from "@/content/en";
import { es } from "@/content/es";
import type { Locale } from "@/lib/i18n/config";
import { I18nProvider } from "@/lib/i18n/provider";

/** Both dictionaries, for a test that asserts on a string by its key. */
export const DICTIONARIES = { es, en };

/**
 * A wrapper that gives a hook or a component the locale and dictionary the
 * root layout provides in the app:
 *
 *   renderHook(() => useDictionary(), { wrapper: createI18nWrapper("es") });
 */
export function createI18nWrapper(locale: Locale = "en") {
  return function I18nWrapper({ children }: { children: ReactNode }) {
    return (
      <I18nProvider dictionary={DICTIONARIES[locale]} locale={locale}>
        {children}
      </I18nProvider>
    );
  };
}

/**
 * `render`, inside the i18n provider. English unless the test says otherwise,
 * so assertions read in the language of the code; a component's test also
 * renders it once in Spanish, which is what catches text hardcoded in either
 * language.
 */
export function renderWithI18n(
  ui: ReactElement,
  {
    locale = "en",
    wrapper: Outer,
    ...options
  }: RenderOptions & { locale?: Locale } = {}
): RenderResult {
  const Inner = createI18nWrapper(locale);

  function Wrapper({ children }: { children: ReactNode }) {
    return Outer ? (
      <Outer>
        <Inner>{children}</Inner>
      </Outer>
    ) : (
      <Inner>{children}</Inner>
    );
  }

  return render(ui, { ...options, wrapper: Wrapper });
}
