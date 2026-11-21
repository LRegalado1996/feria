import { describe, expect, test } from "vitest";

import { couldBeArticle } from "./article-address";

describe("couldBeArticle", () => {
  test.each(["cadena", "anillo-de-plata", "a1"])(
    "takes %s, an address an article can have",
    (slug) => {
      expect(couldBeArticle(slug)).toBe(true);
    }
  );

  test.each(["__sample__", " cadena ", "Cadena", "", "a".repeat(200)])(
    "refuses %j, which no article can have",
    (slug) => {
      expect(couldBeArticle(slug)).toBe(false);
    }
  );
});
