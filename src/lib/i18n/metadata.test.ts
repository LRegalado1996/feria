import { describe, expect, test } from "vitest";

import { buildAlternates } from "./metadata";

describe("buildAlternates", () => {
  test("the Spanish home is canonical without a prefix and names both languages", () => {
    expect(buildAlternates("/", "es")).toEqual({
      canonical: "/",
      languages: { es: "/", en: "/en", "x-default": "/" },
    });
  });

  test("the English version of a page is canonical under /en, with Spanish as the default", () => {
    expect(buildAlternates("/products", "en")).toEqual({
      canonical: "/en/products",
      languages: {
        es: "/products",
        en: "/en/products",
        "x-default": "/products",
      },
    });
  });

  test("takes a path that already carries a prefix", () => {
    expect(buildAlternates("/en/products", "es")).toEqual({
      canonical: "/products",
      languages: {
        es: "/products",
        en: "/en/products",
        "x-default": "/products",
      },
    });
  });
});
