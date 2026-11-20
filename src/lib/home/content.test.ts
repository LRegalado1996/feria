import { describe, expect, test } from "vitest";

import {
  composeHomeSections,
  type HomeBanner,
  type HomeSectionSources,
  homeHref,
} from "./content";

function makeBanner(overrides: Partial<HomeBanner> = {}): HomeBanner {
  return {
    ctaLabel: null,
    href: "/burbujeros",
    id: 9,
    image: { height: 1067, url: "/seed/bubbles-1.jpg", width: 1600 },
    lang: "es",
    phoneImage: null,
    title: "Encontranos en la feria",
    ...overrides,
  };
}

function makeSources(
  overrides: Partial<HomeSectionSources<string>> = {}
): HomeSectionSources<string> {
  return {
    bestSellers: ["pez", "corona"],
    categories: new Map([
      [
        1,
        {
          articles: ["anillo"],
          lang: "es" as const,
          name: "Anillos",
          path: "/bijouterie/anillos",
        },
      ],
      [
        2,
        {
          articles: [],
          lang: "es" as const,
          name: "Relojes",
          path: "/relojes",
        },
      ],
    ]),
    featured: ["esclavas", "sello"],
    rowBanners: new Map([[9, makeBanner()]]),
    ...overrides,
  };
}

describe("homeHref", () => {
  test.each([
    ["/productos", "es", "/productos"],
    ["/productos", "en", "/en/productos"],
    ["https://instagram.com/lr", "en", "https://instagram.com/lr"],
  ] as const)("%s in %s is %s", (link, locale, href) => {
    expect(homeHref(link, locale)).toBe(href);
  });
});

describe("composeHomeSections", () => {
  test("gives each place its content, in the order given", () => {
    expect(
      composeHomeSections(
        [
          { kind: "featured" },
          { bannerId: 9, kind: "banner" },
          { categoryId: 1, kind: "category" },
          { kind: "best_sellers" },
        ],
        makeSources()
      )
    ).toEqual([
      { articles: ["esclavas", "sello"], key: "featured", kind: "featured" },
      { banner: makeBanner(), key: "banner:9", kind: "banner" },
      {
        articles: ["anillo"],
        category: {
          id: 1,
          lang: "es",
          name: "Anillos",
          path: "/bijouterie/anillos",
        },
        key: "category:1",
        kind: "category",
      },
      {
        articles: ["pez", "corona"],
        key: "best_sellers",
        kind: "best_sellers",
      },
    ]);
  });

  test("leaves out a row with no article, an unknown category and a banner that does not show", () => {
    expect(
      composeHomeSections(
        [
          { categoryId: 2, kind: "category" },
          { categoryId: 3, kind: "category" },
          { bannerId: 8, kind: "banner" },
          { kind: "best_sellers" },
          { kind: "featured" },
        ],
        makeSources({ bestSellers: [], featured: [] })
      )
    ).toEqual([]);
  });

  test("a row with one article shows", () => {
    expect(
      composeHomeSections(
        [{ kind: "featured" }],
        makeSources({ featured: ["sello"] })
      )
    ).toEqual([{ articles: ["sello"], key: "featured", kind: "featured" }]);
  });
});
