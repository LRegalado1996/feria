import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createI18nWrapper } from "@/test/i18n";

import { useLocale } from "./use-locale";

function setup(locale: Locale) {
  const { result } = renderHook(() => useLocale(), {
    wrapper: createI18nWrapper(locale),
  });

  return { locale: result.current };
}

describe("useLocale", () => {
  test.each(["es", "en"] as const)("is %s under a %s provider", (provided) => {
    const { locale } = setup(provided);

    expect(locale).toBe(provided);
  });
});
