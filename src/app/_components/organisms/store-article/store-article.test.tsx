import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useEmblaCarousel from "embla-carousel-react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createFakeEmbla } from "@/test/embla";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";

import {
  StoreArticle,
  type StoreArticleData,
  type StoreRelatedArticle,
} from "./store-article";

// The gallery and the row measure a layout happy-dom does not have.
vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

// Intl separates a currency from its amount with a no-break space.
const NBSP = "\u00A0";

const WHATSAPP = "https://wa.me/59899123456?text=Hola";

function makeArticle(
  overrides: Partial<StoreArticleData> = {}
): StoreArticleData {
  return {
    category: { name: "Collares", slug: "collares" },
    currencyCode: "UYU",
    description: "Perlas de río\nhechas a mano.",
    id: 42,
    images: [
      { alt: "El collar", height: 1000, id: 1, url: "/collar.jpg", width: 800 },
    ],
    isAvailable: true,
    lang: "es",
    priceAmount: 120_000,
    slug: "collar-de-perlas",
    title: "Collar de perlas",
    ...overrides,
  };
}

function makeRelated(
  id: number,
  overrides: Partial<StoreRelatedArticle> = {}
): StoreRelatedArticle {
  return {
    cover: { alt: `Foto ${id}`, url: `/related-${id}.jpg` },
    currencyCode: "UYU",
    id,
    isAvailable: true,
    lang: "es",
    priceAmount: id * 1000,
    slug: `articulo-${id}`,
    title: `Artículo ${id}`,
    ...overrides,
  };
}

interface SetupOptions {
  article?: StoreArticleData;
  locale?: Locale;
  related?: StoreRelatedArticle[];
  whatsappHref?: string | null;
}

function setup({
  article = makeArticle(),
  locale = "es",
  related = [
    makeRelated(7),
    makeRelated(8, { cover: null, isAvailable: false }),
  ],
  whatsappHref = WHATSAPP,
}: SetupOptions = {}) {
  window.history.replaceState(null, "", "/elsewhere");
  stubReducedMotion(false);
  vi.mocked(useEmblaCarousel).mockReturnValue(
    createFakeEmbla({ snaps: 2 }).hook
  );
  const user = userEvent.setup();
  renderWithI18n(
    <StoreArticle
      article={article}
      copy={DICTIONARIES[locale].storefront}
      locale={locale}
      related={related}
      whatsappHref={whatsappHref}
    />,
    { locale }
  );

  return {
    breadcrumb: () =>
      within(
        screen.getByRole("navigation", {
          name: locale === "es" ? "Ruta" : "Breadcrumb",
        })
      )
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    page: screen.getByTestId("store-article"),
    user,
  };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("StoreArticle", () => {
  test("leads back to the catalog and to the article's category", () => {
    const { breadcrumb } = setup();

    expect(breadcrumb()).toEqual([
      ["Catálogo", "/products"],
      ["Collares", "/products?category=collares"],
    ]);
  });

  test("leads back without a category when the article has none", () => {
    const { breadcrumb } = setup({ article: makeArticle({ category: null }) });

    expect(breadcrumb()).toEqual([["Catálogo", "/products"]]);
  });

  test("names the article in a heading marked with its language, and shows its price and photos", () => {
    setup({ article: makeArticle({ lang: "en", title: "Pearl necklace" }) });

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/^Pearl necklace$/u);
    expect(heading).toHaveAttribute("lang", "en");
    expect(
      document.querySelector('[data-slot="store-price-tag-amount"]')
        ?.textContent
    ).toBe(`$${NBSP}1.200`);
    expect(screen.getByRole("img", { name: "El collar" })).toBeVisible();
  });

  test("offers the quantity and the add button for an available article", () => {
    const { page } = setup();

    expect(within(page).getByRole("group", { name: "Cantidad" })).toBeVisible();
    expect(
      within(page).getByRole("button", { name: "Agregar al carrito" })
    ).toBeVisible();
    expect(within(page).queryByText("Agotado por ahora")).toBeNull();
  });

  test("a sold-out article says so where its price would be, instead of offering to add it", () => {
    const { page } = setup({
      article: makeArticle({ isAvailable: false }),
      related: [],
    });

    expect(within(page).getByText("Agotado por ahora")).toHaveClass(
      "text-store-muted"
    );
    expect(page.querySelector('[data-slot="store-price-tag"]')).toBeNull();
    expect(
      within(page).getByText(
        "No lo podés agregar al carrito ahora. Escribinos y te avisamos cuando vuelva."
      )
    ).toBeVisible();
    expect(within(page).queryByRole("group", { name: "Cantidad" })).toBeNull();
    expect(
      within(page).queryByRole("button", { name: "Agregar al carrito" })
    ).toBeNull();
  });

  test("asks by WhatsApp in a new tab, without handing it the page", () => {
    setup();

    const whatsapp = screen.getByRole("link", {
      name: "Consultar por WhatsApp (se abre en otra pestaña)",
    });
    expect(whatsapp).toHaveAttribute("href", WHATSAPP);
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("offers no WhatsApp when the store has none", () => {
    setup({ whatsappHref: null });

    expect(screen.queryByTestId("store-article-whatsapp")).toBeNull();
  });

  test.each([
    ["es", "Compartir", "http://localhost:3000/products/collar-de-perlas"],
    ["en", "Share", "http://localhost:3000/en/products/collar-de-perlas"],
  ] as const)(
    "in %s, shares the article's own address",
    async (locale, name, url) => {
      const { user } = setup({ locale });
      const writeText = vi.fn(async (_text: string) => {});
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });

      await user.click(screen.getByRole("button", { name }));

      expect(writeText).toHaveBeenCalledExactlyOnceWith(url);
    }
  );

  test("shows the description in its language, its line breaks kept", () => {
    const { page } = setup();

    const description = within(page).getByText(/^Perlas de río/u);
    expect(description.textContent).toBe("Perlas de río\nhechas a mano.");
    expect(description).toHaveAttribute("lang", "es");
    expect(description).toHaveClass("whitespace-pre-line");
  });

  test("shows no description when there is none", () => {
    const { page } = setup({ article: makeArticle({ description: "" }) });

    expect(page.querySelector(".whitespace-pre-line")).toBeNull();
  });

  test("lists the related articles as cards, links with nothing to add: adding is on each one's page", () => {
    setup();

    const section = screen.getByRole("region", {
      name: "También te puede gustar",
    });
    const [available, soldOut] = within(section).getAllByRole("article");
    expect(
      within(available ?? section).getByRole("link", { name: "Artículo 7" })
    ).toHaveAttribute("href", "/products/articulo-7");
    expect(
      within(available ?? section).getByRole("heading", { level: 3 })
    ).toHaveTextContent(/^Artículo 7$/u);
    expect(within(available ?? section).queryByRole("button")).toBeNull();
    expect(
      within(available ?? section).getByRole("img", { name: "Foto 7" })
    ).toBeVisible();
    expect(within(soldOut ?? section).queryByRole("button")).toBeNull();
    expect(soldOut).toHaveTextContent("Agotado");
    expect(soldOut).toHaveTextContent("Sin foto");
  });

  test.each([
    [
      "its category",
      { name: "Collares", slug: "collares" },
      "/products?category=collares",
    ],
    ["the catalog, for an article with no category", null, "/products"],
  ] as const)(
    "the related row's “Ver todo” leads to %s",
    (_case, category, href) => {
      setup({ article: makeArticle({ category }) });

      expect(
        screen.getByRole("link", { name: "Ver todo: También te puede gustar" })
      ).toHaveAttribute("href", href);
    }
  );

  test("puts the photos first on a phone and on the right on a computer", () => {
    const { page } = setup();

    const gallery = within(page).getByRole("region", {
      name: "Fotos de Collar de perlas",
    });
    expect(gallery).toHaveClass("lg:order-last");
    expect(
      gallery.compareDocumentPosition(screen.getByRole("heading", { level: 1 }))
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  test("shows no related section when there are none", () => {
    setup({ related: [] });

    expect(
      screen.queryByRole("region", { name: "También te puede gustar" })
    ).toBeNull();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  test("in English, prefixes every address and names everything in English", () => {
    const { breadcrumb } = setup({ locale: "en" });

    expect(breadcrumb()).toEqual([
      ["Catalog", "/en/products"],
      ["Collares", "/en/products?category=collares"],
    ]);
    expect(screen.getByRole("link", { name: "Artículo 7" })).toHaveAttribute(
      "href",
      "/en/products/articulo-7"
    );
    expect(
      screen.getByRole("region", { name: "You may also like" })
    ).toBeVisible();
  });
});
