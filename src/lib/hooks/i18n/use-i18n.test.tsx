import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { createI18nWrapper, DICTIONARIES } from "@/test/i18n";

import { useI18n } from "./use-i18n";

describe("useI18n", () => {
  test.each(["es", "en"] as const)(
    "returns the %s locale and dictionary the provider holds",
    (locale) => {
      const { result } = renderHook(() => useI18n(), {
        wrapper: createI18nWrapper(locale),
      });

      expect(result.current.locale).toBe(locale);
      expect(result.current.dictionary).toBe(DICTIONARIES[locale]);
    }
  );

  test("throws outside the provider instead of guessing a language", () => {
    expect(() => renderHook(() => useI18n())).toThrow(
      "useI18n must be used inside an I18nProvider"
    );
  });
});
