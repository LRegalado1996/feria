import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { createI18nWrapper } from "@/test/i18n";

import { useDictionary } from "./use-dictionary";

describe("useDictionary", () => {
  test.each([
    ["es", "Reintentar"],
    ["en", "Try again"],
  ] as const)("reads the interface text in %s", (locale, tryAgain) => {
    const { result } = renderHook(() => useDictionary(), {
      wrapper: createI18nWrapper(locale),
    });

    expect(result.current.common.tryAgain).toBe(tryAgain);
  });
});
