import { describe, expect, test } from "vitest";

import {
  composePageSections,
  type PageBanner,
  type PageSectionSources,
  pageHref,
} from "./content";

function makeBanner(overrides: Partial<PageBanner> = {}): PageBanner {
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

const SPOTLIGHT = {
  article: "pez",
  id: 5,
  label: { lang: "es" as const, text: "Nuevo" },
  phrase: null,
};

function makeSources(
  overrides: Partial<PageSectionSources<string>> = {}
): PageSectionSources<string> {
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
    spotlights: new Map([[5, SPOTLIGHT]]),
    ...overrides,
  };
}

describe("pageHref", () => {
  test.each([
    ["/productos", "es", "/productos"],
    ["/productos", "en", "/en/productos"],
    ["https://instagram.com/lr", "en", "https://instagram.com/lr"],
  ] as const)("%s in %s is %s", (link, locale, href) => {
    expect(pageHref(link, locale)).toBe(href);
  });
});

describe("composePageSections", () => {
  test("gives each place its content, in the order given", () => {
    expect(
      composePageSections(
        [
          { kind: "featured" },
          { bannerId: 9, kind: "banner" },
          { kind: "spotlight", spotlightId: 5 },
          { categoryId: 1, kind: "category" },
          { kind: "best_sellers" },
        ],
        makeSources()
      )
    ).toEqual([
      { articles: ["esclavas", "sello"], key: "featured", kind: "featured" },
      { banner: makeBanner(), key: "banner:9", kind: "banner" },
      { key: "spotlight:5", kind: "spotlight", spotlight: SPOTLIGHT },
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

  test("leaves out a row with no article, an unknown category, a banner that does not show and a spotlight that cannot", () => {
    expect(
      composePageSections(
        [
          { categoryId: 2, kind: "category" },
          { categoryId: 3, kind: "category" },
          { bannerId: 8, kind: "banner" },
          { kind: "spotlight", spotlightId: 6 },
          { kind: "best_sellers" },
          { kind: "featured" },
        ],
        makeSources({ bestSellers: [], featured: [] })
      )
    ).toEqual([]);
  });

  test("a row with one article shows", () => {
    expect(
      composePageSections(
        [{ kind: "featured" }],
        makeSources({ featured: ["sello"] })
      )
    ).toEqual([{ articles: ["sello"], key: "featured", kind: "featured" }]);
  });
});
