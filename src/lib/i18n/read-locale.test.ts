import { describe, expect, test } from "vitest";

import { readLocale } from "./read-locale";

describe("readLocale", () => {
  test.each(["es", "en"] as const)(
    "returns %s for a route in that language",
    async (locale) => {
      await expect(readLocale(Promise.resolve({ locale }))).resolves.toBe(
        locale
      );
    }
  );

  test.each(["fr", "ES", "es-UY", "products", ""])(
    "answers 404 for %j, which is not a language of the product",
    async (locale) => {
      await expect(
        readLocale(Promise.resolve({ locale }))
      ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    }
  );
});
