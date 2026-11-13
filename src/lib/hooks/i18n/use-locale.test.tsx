import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { createI18nWrapper } from "@/test/i18n";

import { useLocale } from "./use-locale";

describe("useLocale", () => {
  test.each(["es", "en"] as const)("is %s under a %s provider", (locale) => {
    const { result } = renderHook(() => useLocale(), {
      wrapper: createI18nWrapper(locale),
    });

    expect(result.current).toBe(locale);
  });
});
