import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createI18nWrapper } from "@/test/i18n";

import { useDictionary } from "./use-dictionary";

function setup(locale: Locale) {
  const { result } = renderHook(() => useDictionary(), {
    wrapper: createI18nWrapper(locale),
  });

  return { dictionary: result.current };
}

describe("useDictionary", () => {
  test.each([
    ["es", "Reintentar"],
    ["en", "Try again"],
  ] as const)("reads the interface text in %s", (locale, tryAgain) => {
    const { dictionary } = setup(locale);

    expect(dictionary.common.tryAgain).toBe(tryAgain);
  });
});
