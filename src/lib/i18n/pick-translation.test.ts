import { describe, expect, test } from "vitest";

import { pickTranslation } from "./pick-translation";

const SPANISH = { locale: "es", tagline: "Hola" } as const;
const ENGLISH = { locale: "en", tagline: "Hello" } as const;

describe("pickTranslation", () => {
  test.each([
    ["es", SPANISH],
    ["en", ENGLISH],
  ] as const)("returns the %s text when it exists", (locale, expected) => {
    expect(pickTranslation([SPANISH, ENGLISH], locale)).toBe(expected);
    // Whatever order the rows came in.
    expect(pickTranslation([ENGLISH, SPANISH], locale)).toBe(expected);
  });

  test.each([
    ["an English visitor the Spanish text", SPANISH, "en"],
    ["a Spanish visitor the English text", ENGLISH, "es"],
  ] as const)("shows %s when it is the only one", (_case, only, locale) => {
    expect(pickTranslation([only], locale)).toBe(only);
  });

  test("returns null when nothing was written", () => {
    expect(pickTranslation([], "es")).toBeNull();
  });
});
