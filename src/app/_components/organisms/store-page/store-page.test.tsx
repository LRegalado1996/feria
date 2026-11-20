import { screen, within } from "@testing-library/react";
import useEmblaCarousel from "embla-carousel-react";
import { describe, expect, test, vi } from "vitest";

import type { StorePageArticle } from "@/app/_components/molecules/store-page-sections";
import type { Locale } from "@/lib/i18n/config";
import type { PageBanner, PageContentSection } from "@/lib/page/content";
import { createFakeEmbla } from "@/test/embla";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";

import { StorePage, type StorePageProps } from "./store-page";

// The carousels measure a layout happy-dom does not have.
vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

function makeBanner(overrides: Partial<PageBanner> = {}): PageBanner {
  return {
    ctaLabel: null,
    href: "/productos",
    id: 31,
    image: { height: 800, url: "/seed/ring-3.jpg", width: 1200 },
    lang: "es",
    phoneImage: null,
    title: "Regalos para las fiestas",
    ...overrides,
  };
}

const ROW: PageContentSection<StorePageArticle> = {
  articles: [
    {
      cover: null,
      currencyCode: "UYU",
      id: 21,
      isAvailable: true,
      lang: "es",
      priceAmount: 69_000,
      slug: "anillo-sello",
      title: "Anillo sello",
    },
  ],
  category: { id: 2, lang: "es", name: "Anillos", path: "/anillos" },
  key: "category:2",
  kind: "category",
};

function setup({
  content = { cover: [makeBanner()], sections: [ROW] },
  draft,
  locale = "es",
  nameLang,
}: {
  content?: StorePageProps["content"];
  draft?: boolean;
  locale?: Locale;
  nameLang?: string;
} = {}) {
  stubReducedMotion(false);
  vi.mocked(useEmblaCarousel).mockReturnValue(
    createFakeEmbla({
      plugins: { autoplay: { name: "autoplay", play: vi.fn(), stop: vi.fn() } },
      snaps: content.cover.length || 1,
    }).hook
  );
  renderWithI18n(
    <StorePage
      content={content}
      copy={DICTIONARIES[locale].storefront}
      draft={draft}
      locale={locale}
      name="Regalos de Navidad"
      nameLang={nameLang}
    />,
    { locale }
  );

  return {
    heading: screen.getByRole("heading", { level: 1 }),
    view: screen.getByTestId("store-page-view"),
  };
}

describe("StorePage", () => {
  test("under a cover, its name is the page's h1 for screen readers only, then the cover's banners and its rows", () => {
    const { heading, view } = setup();

    expect(heading).toHaveTextContent(/^Regalos de Navidad$/u);
    expect(heading).toHaveClass("sr-only");
    expect(view).toHaveAttribute("data-cover", "true");
    const cover = screen.getByTestId("store-page-cover");
    expect(
      within(cover).getByRole("heading", {
        level: 2,
        name: "Regalos para las fiestas",
      })
    ).toBeInTheDocument();
    // In the page's language, under it.
    expect(
      within(cover).getByRole("link", { name: /Regalos para las fiestas/u })
    ).toHaveAttribute("href", "/productos");
    expect(screen.getByRole("link", { name: /Anillo sello/u })).toBeVisible();
    expect(screen.queryByTestId("store-page-draft")).toBeNull();
  });

  test("in English, the cover's links lead under /en", () => {
    setup({ locale: "en" });

    expect(
      within(screen.getByTestId("store-page-cover")).getByRole("link", {
        name: /Regalos para las fiestas/u,
      })
    ).toHaveAttribute("href", "/en/productos");
  });

  test("without a cover, its name is a visible h1 above its rows, in its own language", () => {
    const { heading, view } = setup({
      content: { cover: [], sections: [ROW] },
      locale: "en",
      nameLang: "es",
    });

    expect(heading).not.toHaveClass("sr-only");
    expect(heading).toHaveAttribute("lang", "es");
    expect(view).toHaveAttribute("data-cover", "false");
    expect(screen.queryByTestId("store-page-cover")).toBeNull();
    expect(
      screen.queryByText(DICTIONARIES.en.storefront.page.empty)
    ).toBeNull();
  });

  test("with nothing to show, says its name and that it shows nothing yet", () => {
    const { heading } = setup({ content: { cover: [], sections: [] } });

    expect(heading).toHaveTextContent(/^Regalos de Navidad$/u);
    expect(
      screen.getByText(DICTIONARIES.es.storefront.page.empty)
    ).toBeInTheDocument();
  });

  test("a cover with no row says nothing is missing", () => {
    setup({ content: { cover: [makeBanner()], sections: [] } });

    expect(
      screen.queryByText(DICTIONARIES.es.storefront.page.empty)
    ).toBeNull();
  });

  test("a draft an admin previews says the public does not see it", () => {
    setup({ draft: true, locale: "en" });

    expect(screen.getByRole("note")).toHaveTextContent(
      DICTIONARIES.en.storefront.page.draft
    );
  });
});
