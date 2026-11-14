import { describe, expect, test } from "vitest";

import { DEFAULT_LOCALE, isLocale, LOCALES } from "./config";

describe("locales", () => {
  test("are Spanish and English, Spanish being the one without a prefix", () => {
    expect(LOCALES).toEqual(["es", "en"]);
    expect(DEFAULT_LOCALE).toBe("es");
  });
});

describe("isLocale", () => {
  test.each(["es", "en"])("accepts %j", (value) => {
    expect(isLocale(value)).toBe(true);
  });

  test.each(["EN", "es-UY", "fr", "english", "", null, undefined, 0, ["es"]])(
    "rejects %j",
    (value) => {
      expect(isLocale(value)).toBe(false);
    }
  );
});
