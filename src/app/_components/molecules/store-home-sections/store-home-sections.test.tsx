import { screen, within } from "@testing-library/react";
import useEmblaCarousel from "embla-carousel-react";
import { describe, expect, test, vi } from "vitest";

import type { HomeBanner, HomeContentSection } from "@/lib/home/content";
import type { Locale } from "@/lib/i18n/config";
import { createFakeEmbla } from "@/test/embla";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";
import { required } from "@/test/required";

import {
  type StoreHomeArticle,
  StoreHomeSections,
  type StoreHomeSectionsProps,
} from "./store-home-sections";

// The rows measure a layout happy-dom does not have.
vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

type Section = HomeContentSection<StoreHomeArticle>;

function makeArticle(
  overrides: Partial<StoreHomeArticle> = {}
): StoreHomeArticle {
  return {
    cover: {
      alt: "Anillo sello dorado",
      height: 900,
      url: "/seed/ring-2.jpg",
      width: 900,
    },
    currencyCode: "UYU",
    id: 21,
    isAvailable: true,
    lang: "es",
    priceAmount: 129_000,
    slug: "anillo-sello",
    title: "Anillo sello",
    ...overrides,
  };
}

function makeBanner(overrides: Partial<HomeBanner> = {}): HomeBanner {
  return {
    ctaLabel: null,
    href: "/burbujeros",
    id: 31,
    image: { height: 1063, url: "/seed/bubbles-1.jpg", width: 1600 },
    lang: "es",
    phoneImage: { height: 1063, url: "/seed/bubbles-1-phone.jpg", width: 850 },
    title: "Encontranos en la feria",
    ...overrides,
  };
}

function bannerSection(overrides: Partial<HomeBanner> = {}): Section {
  const banner = makeBanner(overrides);

  return { banner, key: `banner:${banner.id}`, kind: "banner" };
}

function categorySection(
  overrides: { articles?: StoreHomeArticle[]; lang?: Locale } = {}
): Section {
  return {
    articles: overrides.articles ?? [makeArticle({ id: 22, title: "Aro" })],
    category: {
      id: 4,
      lang: overrides.lang ?? "es",
      name: "Aros",
      path: "/bijouterie/aros",
    },
    key: "category:4",
    kind: "category",
  };
}

const SEQUENCE: Section[] = [
  { articles: [makeArticle()], key: "best_sellers", kind: "best_sellers" },
  bannerSection(),
  categorySection(),
  {
    articles: [makeArticle({ id: 23, title: "Cadena corona" })],
    key: "featured",
    kind: "featured",
  },
];

function setup({
  locale = "es",
  ...props
}: Partial<StoreHomeSectionsProps> = {}) {
  stubReducedMotion(false);
  vi.mocked(useEmblaCarousel).mockReturnValue(
    createFakeEmbla({ snaps: 1 }).hook
  );
  renderWithI18n(
    <StoreHomeSections
      copy={DICTIONARIES[locale].storefront}
      locale={locale}
      sections={SEQUENCE}
      {...props}
    />,
    { locale }
  );

  return {
    sections: () => screen.getAllByTestId("store-home-section"),
  };
}

describe("StoreHomeSections", () => {
  test.each([
    ["es", "Más vendidos", "Destacados", "/productos/anillo-sello"],
    ["en", "Best sellers", "Featured", "/en/productos/anillo-sello"],
  ] as const)(
    "in %s, draws the rows and the banners in their order, each under its h2",
    (locale, bestSellers, featured, articleHref) => {
      const { sections } = setup({ locale });

      expect(sections().map((section) => section.dataset.kind)).toEqual([
        "best_sellers",
        "banner",
        "category",
        "featured",
      ]);
      expect(
        screen
          .getAllByRole("heading", { level: 2 })
          .map((heading) => heading.textContent)
      ).toEqual([bestSellers, "Encontranos en la feria", "Aros", featured]);
      // The catalog's cards: one link each, to the article's page.
      expect(
        within(required(sections()[0])).getByRole("link", {
          name: "Anillo sello",
        })
      ).toHaveAttribute("href", articleHref);
    }
  );

  test('a category\'s row leads to its page with "Ver todo"; the curated rows, which show everything they hold, have none', () => {
    setup();

    expect(
      screen
        .getAllByRole("link", { name: /^Ver todo/u })
        .map((link) => [
          link.getAttribute("aria-label"),
          link.getAttribute("href"),
        ])
    ).toEqual([["Ver todo: Aros", "/bijouterie/aros"]]);
  });

  test("marks a category's name with its own language, which may not be the page's", () => {
    setup({ locale: "en" });

    expect(screen.getByRole("heading", { name: "Aros" })).toHaveAttribute(
      "lang",
      "es"
    );
    expect(
      screen.getByRole("heading", { name: "Best sellers" })
    ).not.toHaveAttribute("lang");
  });

  test("shows the cards as the catalog does: the photo for a row's width, the price, and a sold-out one said so", () => {
    setup({
      locale: "en",
      sections: [
        categorySection({
          articles: [
            makeArticle(),
            makeArticle({
              cover: null,
              id: 24,
              isAvailable: false,
              title: "Aro perla",
            }),
          ],
        }),
      ],
    });

    const photo = screen.getByRole("img", { name: "Anillo sello dorado" });
    expect(photo).toHaveAttribute(
      "sizes",
      "(min-width: 1024px) 24vw, (min-width: 640px) 40vw, 62vw"
    );
    expect(screen.getByText("UYU 1,290")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Aro perla" }).closest("article")
    ).toHaveTextContent("Sold out");
  });

  test("a banner between rows leads where it was set, with its phone crop and its own words in its language", () => {
    setup({
      locale: "en",
      sections: [
        bannerSection({ ctaLabel: "Ver el catálogo", href: "/productos" }),
      ],
    });

    const banner = screen.getByRole("link", {
      name: "Encontranos en la feria Ver el catálogo",
    });
    expect(banner).toHaveAttribute("href", "/en/productos");
    expect(banner).toHaveAttribute("data-size", "row");
    expect(banner.querySelector("img")?.getAttribute("src")).toContain(
      encodeURIComponent("/seed/bubbles-1-phone.jpg")
    );
    expect(screen.getByText("Ver el catálogo")).toHaveAttribute("lang", "es");
  });

  test("a banner with no link of its own is its photo and title, and an address keeps its own form", () => {
    setup({
      locale: "en",
      sections: [
        bannerSection({ href: null, id: 41, title: "Sin enlace" }),
        bannerSection({
          href: "https://instagram.com/lr",
          id: 42,
          title: "Seguinos",
        }),
      ],
    });

    expect(screen.getAllByRole("link")).toEqual([
      screen.getByRole("link", { name: "Seguinos Shop now" }),
    ]);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://instagram.com/lr"
    );
    expect(screen.getByText("Shop now")).not.toHaveAttribute("lang");
  });

  test("below the fold, its photos wait; only a banner opening a page with no cover loads first", () => {
    setup({ sections: [bannerSection(), bannerSection({ id: 32 })] });

    expect(
      [...document.querySelectorAll('[data-slot="store-banner"] img')].map(
        (photo) => photo.getAttribute("loading")
      )
    ).toEqual(["lazy", "lazy"]);
  });

  test("a banner that opens the page is its priority image", () => {
    setup({
      leading: true,
      sections: [bannerSection(), bannerSection({ id: 32 })],
    });

    const photos = [
      ...document.querySelectorAll('[data-slot="store-banner"] img'),
    ];
    expect(photos.map((photo) => photo.getAttribute("fetchpriority"))).toEqual([
      "high",
      null,
    ]);
  });

  test("a row opening the page leaves nothing to load first", () => {
    setup({ leading: true, sections: [categorySection(), bannerSection()] });

    expect(
      document.querySelector('[data-slot="store-banner"] img')
    ).toHaveAttribute("loading", "lazy");
  });

  test.each([
    [false, ["", "mt-2.5"]],
    [true, ["mt-2.5", "mt-2.5"]],
  ] as const)(
    "a banner under another banner keeps a gutter from it (under the cover: %s)",
    (afterBanner, gutters) => {
      const { sections } = setup({
        afterBanner,
        sections: [
          bannerSection(),
          bannerSection({ id: 32 }),
          categorySection(),
        ],
      });

      expect(
        sections().map((section) =>
          section.classList.contains("mt-2.5") ? "mt-2.5" : ""
        )
      ).toEqual([...gutters, ""]);
    }
  );

  test("a banner under a row needs no gutter: the row's own room is there", () => {
    const { sections } = setup({ afterBanner: true });

    expect(
      sections().map((section) => section.classList.contains("mt-2.5"))
    ).toEqual([false, false, false, false]);
  });

  test("rises into view section by section when asked, and stays plain otherwise", () => {
    const { sections } = setup({ reveal: true });

    expect(sections().map((section) => section.dataset.slot)).toEqual([
      "store-reveal",
      "store-reveal",
      "store-reveal",
      "store-reveal",
    ]);
  });

  test("without reveal, every section is a plain block", () => {
    const { sections } = setup();

    expect(sections().map((section) => section.dataset.slot)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  test("takes the heading level it is given, for a preview under its own headings", () => {
    setup({ headingLevel: "h3" });

    expect(screen.queryAllByRole("heading", { level: 2 })).toEqual([]);
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .filter((heading) => heading.dataset.slot === "store-banner-title")
        .map((heading) => heading.textContent)
    ).toEqual(["Encontranos en la feria"]);
  });

  test("with no section, is an empty block", () => {
    setup({ className: "pb-4", sections: [] });

    const root = document.querySelector('[data-slot="store-home-sections"]');
    expect(root).toBeEmptyDOMElement();
    expect(root).toHaveClass("flex", "flex-col", "pb-4");
  });
});
