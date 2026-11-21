import { screen, within } from "@testing-library/react";
import useEmblaCarousel from "embla-carousel-react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createFakeEmbla } from "@/test/embla";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";

import {
  StoreArticleMain,
  type StoreArticleMainData,
} from "./store-article-main";

// The gallery measures a layout happy-dom does not have.
vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

function makeArticle(
  overrides: Partial<StoreArticleMainData> = {}
): StoreArticleMainData {
  return {
    category: {
      group: { name: "Bijouterie", path: "/bijouterie" },
      name: "Anillos",
      path: "/bijouterie/anillos",
    },
    currencyCode: "UYU",
    description:
      "Plata 925\nhecha a mano.\n\n  \n\nSe usa sola.\n\nSe usa sola.",
    images: [
      {
        alt: "El anillo",
        height: 900,
        id: 1,
        url: "/seed/ring-2.jpg",
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
}: { article?: ReturnType<typeof makeArticle>; locale?: Locale } = {}) {
  stubReducedMotion(false);
  vi.mocked(useEmblaCarousel).mockReturnValue(
    createFakeEmbla({ snaps: 1 }).hook
  );
  renderWithI18n(
    <StoreArticleMain
      article={article}
      copy={DICTIONARIES[locale].storefront}
      locale={locale}
    >
      <p data-testid="after-description">The purchase</p>
    </StoreArticleMain>,
    { locale }
  );

  const trail = () =>
    within(
      screen.getByRole("navigation", {
        name: locale === "es" ? "Ruta" : "Breadcrumb",
      })
    )
      .getAllByRole("listitem")
      .map((step) => [
        step.textContent,
        step.querySelector("a")?.getAttribute("href") ?? null,
      ]);

  return { trail };
}

describe("StoreArticleMain", () => {
  test("trails from the home through the catalog, the group and the category to the article", () => {
    const { trail } = setup();

    expect(trail()).toEqual([
      ["Home", "/en"],
      ["Catalog", "/en/productos"],
      ["Bijouterie", "/en/bijouterie"],
      ["Anillos", "/en/bijouterie/anillos"],
      ["Anillo de plata", null],
    ]);
  });

  test("leaves the group and the category out of the trail when it has none", () => {
    const { trail } = setup({ article: makeArticle({ category: null }) });

    expect(trail().map(([name]) => name)).toEqual([
      "Home",
      "Catalog",
      "Anillo de plata",
    ]);
  });

  test("names the article in its own language, then its price, then its paragraphs, then what the page adds", () => {
    setup();

    expect(
      screen.getByRole("heading", { level: 1, name: "Anillo de plata" })
    ).toHaveAttribute("lang", "es");
    expect(screen.getByText("UYU 1,290")).toBeVisible();
    const description = screen.getByTestId("store-article-description");
    expect(
      [...description.querySelectorAll("p")].map(
        (paragraph) => paragraph.textContent
      )
    ).toEqual(["Plata 925\nhecha a mano.", "Se usa sola.", "Se usa sola."]);
    expect(description).toHaveAttribute("lang", "es");
    expect(screen.getByTestId("after-description")).toHaveTextContent(
      "The purchase"
    );
  });

  test("says a sold-out article is unavailable instead of its price", () => {
    setup({ article: makeArticle({ isAvailable: false }) });

    expect(screen.queryByText("UYU 1,290")).toBeNull();
    expect(screen.getByText("Sold out for now")).toBeVisible();
  });

  test("shows no description block for an article without one", () => {
    setup({ article: makeArticle({ description: "  " }) });

    expect(screen.queryByTestId("store-article-description")).toBeNull();
  });

  test("shows its photos in the gallery", () => {
    setup();

    expect(screen.getByRole("img", { name: "El anillo" })).toBeVisible();
  });

  test("in Spanish, trails and prices in Spanish", () => {
    const { trail } = setup({ locale: "es" });

    expect(trail()[1]).toEqual(["Catálogo", "/productos"]);
    expect(screen.getByText("$ 1.290")).toBeVisible();
  });
});
