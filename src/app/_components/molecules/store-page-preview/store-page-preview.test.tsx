import { screen, within } from "@testing-library/react";
import useEmblaCarousel from "embla-carousel-react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { PageBanner } from "@/lib/page/content";
import type { PagePreview } from "@/lib/page/preview";
import { createFakeEmbla } from "@/test/embla";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";

import {
  StorePagePreview,
  type StorePagePreviewArticle,
} from "./store-page-preview";

// The rows measure a layout happy-dom does not have.
vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

function makeArticle(
  overrides: Partial<StorePagePreviewArticle> = {}
): StorePagePreviewArticle {
  return {
    cover: {
      alt: "Anillo sello",
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

function makeBanner(overrides: Partial<PageBanner> = {}): PageBanner {
  return {
    ctaLabel: null,
    href: "/burbujeros",
    id: 31,
    image: { height: 1067, url: "/seed/bubble-gun-2.jpg", width: 1600 },
    lang: "es",
    phoneImage: null,
    title: "Burbujeros para toda la familia",
    ...overrides,
  };
}

const EMPTY: PagePreview<StorePagePreviewArticle> = {
  announcement: null,
  cover: [],
  sections: [],
};

function setup({
  content = EMPTY,
  locale = "en",
}: {
  content?: PagePreview<StorePagePreviewArticle>;
  locale?: Locale;
} = {}) {
  stubReducedMotion(false);
  vi.mocked(useEmblaCarousel).mockReturnValue(
    createFakeEmbla({ snaps: 1 }).hook
  );
  renderWithI18n(
    <StorePagePreview
      className="rounded-md"
      content={content}
      copy={DICTIONARIES[locale].storefront}
      locale={locale}
      words={{
        coverMore: DICTIONARIES[locale].admin.home.preview.coverMore,
        empty: DICTIONARIES[locale].admin.home.preview.empty,
      }}
    />,
    { locale }
  );

  return { preview: screen.getByTestId("store-page-preview") };
}

describe("StorePagePreview", () => {
  test("is a picture nobody can focus or follow, on the store's own page", () => {
    const { preview } = setup({
      content: { ...EMPTY, cover: [makeBanner()] },
    });

    expect(preview).toHaveAttribute("inert");
    expect(preview).toHaveClass(
      "bg-store-background",
      "text-store-foreground",
      "rounded-md"
    );
    // Its own stacking context: the bar's link sits above the storefront's
    // header, never above the admin's top bar.
    expect(preview).toHaveClass("isolate");
  });

  test("with nothing to show, says so", () => {
    const { preview } = setup();

    expect(preview).toHaveTextContent(
      /^With what you chose, the home shows nothing yet\.$/u
    );
    expect(screen.queryByTestId("store-announcement-bar")).toBeNull();
  });

  test.each([
    ["en", "/productos", "/en/productos"],
    ["es", "/productos", "/productos"],
    ["en", "https://instagram.com/lr", "https://instagram.com/lr"],
  ] as const)(
    "in %s, draws the bar with its link %s as %s and its short line",
    (locale, link, href) => {
      setup({
        content: {
          ...EMPTY,
          announcement: {
            href: link,
            lang: "es",
            shortText: "En la feria",
            text: "Encontranos en la feria, del 5/12 al 5/1",
          },
        },
        locale,
      });

      const bar = screen.getByTestId("store-announcement-bar");
      expect(
        within(bar).getByTestId("store-announcement-bar-link")
      ).toHaveAttribute("href", href);
      expect(
        within(bar).getByTestId("store-announcement-bar-short")
      ).toHaveTextContent(/^En la feria$/u);
      expect(bar.querySelector("p")).toHaveAttribute("lang", "es");
      expect(screen.queryByText(/nothing yet/u)).toBeNull();
    }
  );

  test("draws a bar without a link as only words", () => {
    setup({
      content: {
        ...EMPTY,
        announcement: {
          href: null,
          lang: "en",
          shortText: null,
          text: "Find us at the fair",
        },
      },
    });

    expect(screen.queryByTestId("store-announcement-bar-link")).toBeNull();
    expect(screen.getByTestId("store-announcement-bar")).toHaveTextContent(
      /^Find us at the fair$/u
    );
  });

  test("shows the cover's first banner, with its own button, and how many more it moves through", () => {
    setup({
      content: {
        ...EMPTY,
        cover: [
          makeBanner({ ctaLabel: "Ver burbujeros" }),
          makeBanner({ id: 32, title: "Joyas" }),
          makeBanner({ id: 33, title: "Cadenas" }),
        ],
      },
    });

    const cover = screen.getByTestId("store-home-preview-cover");
    const banner = within(cover).getByRole("link");
    expect(banner).toHaveAttribute("href", "/en/burbujeros");
    expect(banner).toHaveAccessibleName(
      "Burbujeros para toda la familia Ver burbujeros"
    );
    // Its words are the banner's own, in the banner's language.
    expect(
      within(cover).getByRole("heading", {
        level: 3,
        name: "Burbujeros para toda la familia",
      })
    ).toHaveAttribute("lang", "es");
    expect(within(cover).getByText("Ver burbujeros")).toHaveAttribute(
      "lang",
      "es"
    );
    // A banner's height, not the home's nearly-a-screen cover.
    expect(banner).toHaveAttribute("data-size", "row");
    expect(cover).toHaveTextContent("And 2 more in the cover.");
    expect(cover).not.toHaveTextContent("Joyas");
  });

  test("a single cover banner says no more, its button the dictionary's", () => {
    setup({ content: { ...EMPTY, cover: [makeBanner()] } });

    const cover = screen.getByTestId("store-home-preview-cover");
    expect(within(cover).getByRole("link")).toHaveAccessibleName(
      "Burbujeros para toda la familia Shop now"
    );
    expect(cover).not.toHaveTextContent("more in the cover");
  });

  test("draws the rows in order under their headings, and a banner without a link as only a picture", () => {
    setup({
      content: {
        ...EMPTY,
        sections: [
          {
            articles: [makeArticle()],
            key: "best_sellers",
            kind: "best_sellers",
          },
          {
            banner: makeBanner({ href: null, id: 34, title: "En la feria" }),
            key: "banner:34",
            kind: "banner",
          },
          {
            articles: [
              makeArticle({
                id: 22,
                isAvailable: false,
                slug: "aro",
                title: "Aro",
              }),
            ],
            category: {
              id: 4,
              lang: "es",
              name: "Aros",
              path: "/bijouterie/aros",
            },
            key: "category:4",
            kind: "category",
          },
          {
            articles: [makeArticle({ id: 23, cover: null })],
            key: "featured",
            kind: "featured",
          },
        ],
      },
    });

    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual([
      "Best sellers",
      "Anillo sello",
      "En la feria",
      "Aros",
      "Aro",
      "Featured",
      "Anillo sello",
    ]);
    expect(screen.getByRole("link", { name: "See all: Aros" })).toHaveAttribute(
      "href",
      "/en/bijouterie/aros"
    );
    expect(
      screen.getAllByRole("link", { name: /Anillo sello/u })[0]
    ).toHaveAttribute("href", "/en/productos/anillo-sello");
    expect(screen.getByText("Sold out")).toBeInTheDocument();
    const between = screen
      .getByText("En la feria")
      .closest('[data-slot="store-banner"]');
    expect(between?.tagName).toBe("DIV");
    expect(between).not.toHaveTextContent("Shop now");
    expect(
      screen.queryByRole("link", { name: /See all: (Best|Featured)/u })
    ).toBeNull();
  });

  test("speaks Spanish on a Spanish page", () => {
    setup({
      content: {
        ...EMPTY,
        cover: [makeBanner(), makeBanner({ id: 32 })],
        sections: [
          { articles: [makeArticle()], key: "featured", kind: "featured" },
        ],
      },
      locale: "es",
    });

    expect(
      screen.getByRole("heading", { name: "Destacados" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("store-home-preview-cover")).toHaveTextContent(
      "Y 1 más en la portada."
    );
  });
});
