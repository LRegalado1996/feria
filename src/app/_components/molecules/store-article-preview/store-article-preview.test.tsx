import { screen, within } from "@testing-library/react";
import useEmblaCarousel from "embla-carousel-react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { StoreArticleMainData } from "@/app/_components/molecules/store-article-main";
import type { Locale } from "@/lib/i18n/config";
import { createFakeEmbla } from "@/test/embla";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";

import { StoreArticlePreview } from "./store-article-preview";

// The gallery measures a layout happy-dom does not have.
vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

afterEach(() => {
  localStorage.clear();
});

function makeArticle(
  overrides: Partial<StoreArticleMainData> = {}
): StoreArticleMainData {
  return {
    category: null,
    currencyCode: "UYU",
    description: "Plata 925.",
    images: [
      {
        alt: "Anillo de plata",
        height: 900,
        id: 0,
        url: "blob:main",
        width: 900,
      },
      {
        alt: "Anillo de plata",
        height: 900,
        id: 1,
        url: "/seed/ring-1.jpg",
        width: 900,
      },
    ],
    isAvailable: true,
    lang: "es",
    priceAmount: 129_000,
    title: "Anillo de plata",
    ...overrides,
  };
}

function setup({
  article = makeArticle(),
  locale = "en",
  view = "card",
}: {
  article?: ReturnType<typeof makeArticle>;
  locale?: Locale;
  view?: "card" | "page";
} = {}) {
  stubReducedMotion(false);
  vi.mocked(useEmblaCarousel).mockReturnValue(
    createFakeEmbla({ snaps: 2 }).hook
  );
  renderWithI18n(
    <StoreArticlePreview
      article={article}
      copy={DICTIONARIES[locale].storefront}
      href="/en/productos/anillo-de-plata"
      locale={locale}
      view={view}
    />,
    { locale }
  );

  return {
    preview: screen.getByTestId(
      view === "card"
        ? "store-article-preview-card"
        : "store-article-preview-page"
    ),
  };
}

describe("StoreArticlePreview", () => {
  test("draws the card as the store does: the main photo on the grey tile, the name, the price", () => {
    const { preview } = setup();
    const card = within(preview);

    expect(preview).toHaveAttribute("inert");
    const tile = preview.querySelector('[data-slot="store-article-card-tile"]');
    expect(tile?.className).toContain("bg-store-surface");
    expect(tile?.querySelector("img")).toHaveAttribute("src", "blob:main");
    expect(card.getByRole("link", { name: "Anillo de plata" })).toHaveAttribute(
      "href",
      "/en/productos/anillo-de-plata"
    );
    expect(preview).toHaveTextContent("UYU 1,290");
  });

  test.each([
    [true, "UYU 1,290", null],
    [false, null, "Sold out"],
  ])(
    "draws a card available %s as the store would",
    (isAvailable, price, soldOut) => {
      const { preview } = setup({ article: makeArticle({ isAvailable }) });

      expect(/UYU\s1,290/u.test(preview.textContent ?? "")).toBe(
        price !== null
      );
      expect(
        preview.querySelector('[data-slot="store-article-card-sold-out"]')
          ?.textContent ?? null
      ).toBe(soldOut);
    }
  );

  test("draws a card without a photo as the store does", () => {
    const { preview } = setup({ article: makeArticle({ images: [] }) });

    expect(
      preview.querySelector('[data-slot="store-article-card-no-image"]')
    ).not.toBeNull();
  });

  test("draws the top of the article's page with its purchase, out of reach", () => {
    const { preview } = setup({ view: "page" });
    const page = within(preview);

    expect(preview).toHaveAttribute("inert");
    expect(
      page.getByRole("heading", { level: 1, name: "Anillo de plata" })
    ).toBeInTheDocument();
    expect(
      page.getByRole("button", { name: "Add to cart" })
    ).toBeInTheDocument();
  });

  test("draws a sold-out article's page with the store's words instead of the purchase", () => {
    const { preview } = setup({
      article: makeArticle({ isAvailable: false }),
      view: "page",
    });

    expect(
      within(preview).queryByRole("button", { name: "Add to cart" })
    ).toBeNull();
    expect(preview).toHaveTextContent(
      DICTIONARIES.en.storefront.article.unavailableBody
    );
  });

  test("in Spanish, draws it in Spanish", () => {
    const { preview } = setup({ locale: "es", view: "page" });

    expect(
      within(preview).getByRole("button", { name: "Agregar al carrito" })
    ).toBeInTheDocument();
    expect(preview).toHaveTextContent("$ 1.290");
  });
});
