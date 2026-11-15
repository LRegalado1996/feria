import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createI18nWrapper, DICTIONARIES } from "@/test/i18n";

import { useI18n } from "./use-i18n";

/** Renders the hook under a provider for `locale`, or under none. */
function setup({ locale }: { locale: Locale | null }) {
  const read = () =>
    renderHook(() => useI18n(), {
      wrapper: locale ? createI18nWrapper(locale) : undefined,
    }).result.current;

  return { read };
}

describe("useI18n", () => {
  test.each(["es", "en"] as const)(
    "returns the %s locale and dictionary the provider holds",
    (locale) => {
      const { read } = setup({ locale });

      expect(read()).toEqual({ dictionary: DICTIONARIES[locale], locale });
    }
  );

  test("throws outside the provider instead of guessing a language", () => {
    const { read } = setup({ locale: null });

    expect(read).toThrow("useI18n must be used inside an I18nProvider");
  });
});
