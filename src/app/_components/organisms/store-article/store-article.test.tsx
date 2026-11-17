import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useEmblaCarousel from "embla-carousel-react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type * as UiHooks from "@/lib/hooks/ui";
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

// The server's pick, in the pool's order: the browser's draw has the row's
// own tests (`molecules/store-related-row`).
vi.mock("@/lib/hooks/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof UiHooks>()),
  useVisitSeed: () => null,
}));

// Intl separates a currency from its amount with a no-break space.
const NBSP = "\u00A0";

const WHATSAPP = "https://wa.me/59899123456?text=Hola";

function makeArticle(
  overrides: Partial<StoreArticleData> = {}
): StoreArticleData {
  return {
    category: {
      group: null,
      name: "Collares",
      path: "/collares",
      slug: "collares",
    },
    currencyCode: "UYU",
    description:
      "Perlas de río\nhechas a mano.\n\nSe usa sola o con otra cadena.",
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
  related?: {
    others: StoreRelatedArticle[];
    same: StoreRelatedArticle[];
  };
  whatsappHref?: string | null;
}

function setup({
  article = makeArticle(),
  locale = "es",
  related = {
    others: [],
    same: [makeRelated(7), makeRelated(8, { cover: null, isAvailable: false })],
  },
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
      ["Todos los artículos", "/productos"],
      ["Collares", "/collares"],
    ]);
  });

  test("leads back through the group of the article's category (FER-043)", () => {
    const { breadcrumb } = setup({
      article: makeArticle({
        category: {
          group: { name: "Bijouterie", path: "/bijouterie" },
          name: "Anillos",
          path: "/bijouterie/anillos",
          slug: "anillos",
        },
      }),
    });

    expect(breadcrumb()).toEqual([
      ["Todos los artículos", "/productos"],
      ["Bijouterie", "/bijouterie"],
      ["Anillos", "/bijouterie/anillos"],
    ]);
  });

  test("leads back without a category when the article has none", () => {
    const { breadcrumb } = setup({ article: makeArticle({ category: null }) });

    expect(breadcrumb()).toEqual([["Todos los artículos", "/productos"]]);
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
      related: { others: [], same: [] },
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
    ["es", "Compartir", "http://localhost:3000/productos/collar-de-perlas"],
    ["en", "Share", "http://localhost:3000/en/productos/collar-de-perlas"],
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

  test("shows the whole description in its language, a paragraph for each blank line, its line breaks kept", () => {
    const { page } = setup();

    const description = within(page).getByTestId("store-article-description");
    expect(
      [...description.querySelectorAll("p")].map((line) => line.textContent)
    ).toEqual([
      "Perlas de río\nhechas a mano.",
      "Se usa sola o con otra cadena.",
    ]);
    expect(description).toHaveAttribute("lang", "es");
    expect(description.querySelector("p")).toHaveClass("whitespace-pre-line");
    expect(description).not.toHaveClass("line-clamp-3");
  });

  test.each([
    ["only blank lines", "\n\n  \n", 0],
    ["blank lines around one paragraph", "\n\nUno.\n\n\n", 1],
    ["the same paragraph twice", "Igual.\n\nIgual.", 2],
  ])("with %s, shows that many paragraphs", (_case, text, count) => {
    const { page } = setup({ article: makeArticle({ description: text }) });

    expect(
      within(page).queryByTestId("store-article-description")?.children
        .length ?? 0
    ).toBe(count);
  });

  test("sets the price as plain text right under the name, then the description, then the quantity beside the button", () => {
    const { page } = setup();

    const name = within(page).getByRole("heading", { level: 1 });
    expect(name).toHaveClass("store-display-article");
    expect(name.nextElementSibling).toHaveAttribute(
      "data-slot",
      "store-price-tag"
    );
    expect(name.nextElementSibling?.nextElementSibling).toHaveAttribute(
      "data-testid",
      "store-article-description"
    );
    expect(
      name.nextElementSibling?.nextElementSibling?.nextElementSibling
    ).toHaveAttribute("data-slot", "store-article-purchase");
  });

  test("shows no description when there is none", () => {
    const { page } = setup({ article: makeArticle({ description: "" }) });

    expect(within(page).queryByTestId("store-article-description")).toBeNull();
  });

  test("lists the related articles as cards, links with nothing to add: adding is on each one's page", () => {
    setup();

    const section = screen.getByRole("region", {
      name: "También te puede gustar",
    });
    const [available, soldOut] = within(section).getAllByRole("article");
    expect(
      within(available ?? section).getByRole("link", { name: "Artículo 7" })
    ).toHaveAttribute("href", "/productos/articulo-7");
    expect(
      within(available ?? section).getByRole("heading", { level: 3 })
    ).toHaveTextContent(/^Artículo 7$/u);
    expect(within(available ?? section).queryByRole("button")).toBeNull();
    expect(
      within(available ?? section).getByRole("img", { name: "Foto 7" })
    ).toBeVisible();
    expect(within(soldOut ?? section).queryByRole("button")).toBeNull();
    // Two lines kept for every name: the browser may swap the cards.
    expect(
      within(available ?? section).getByRole("heading", { level: 3 })
    ).toHaveClass("line-clamp-2", "min-h-[2lh]");
    expect(soldOut).toHaveTextContent("Agotado");
    expect(soldOut).toHaveTextContent("Sin foto");
  });

  test.each([
    [
      "its category",
      { group: null, name: "Collares", path: "/collares", slug: "collares" },
      "/collares",
    ],
    ["all articles, for an article with no category", null, "/productos"],
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

  test.each([
    [
      "es",
      "¡Felices Fiestas!",
      "Pausar la animación",
      "También te puede gustar",
    ],
    ["en", "Happy Holidays!", "Pause the animation", "You may also like"],
  ] as const)(
    "in %s, separates the article from its suggestions with the festive band, its picture for the eye only",
    (locale, greeting, pause, related) => {
      const { page } = setup({ locale });

      const band = within(page).getByTestId("store-article-band");
      expect(
        within(band).getByTestId("store-article-band-picture")
      ).toHaveAttribute("aria-hidden", "true");
      expect(band).toHaveTextContent(greeting);
      expect(within(band).getByRole("button")).toHaveAccessibleName(pause);
      expect(
        band.compareDocumentPosition(
          screen.getByRole("region", { name: related })
        )
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(
        band.compareDocumentPosition(
          screen.getByRole("button", {
            name: locale === "es" ? "Agregar al carrito" : "Add to cart",
          })
        )
      ).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    }
  );

  test("shows no related section when there are none", () => {
    setup({ related: { others: [], same: [] } });

    expect(
      screen.queryByRole("region", { name: "También te puede gustar" })
    ).toBeNull();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  test("in English, prefixes every address and names everything in English", () => {
    const { breadcrumb } = setup({ locale: "en" });

    expect(breadcrumb()).toEqual([
      ["All articles", "/en/productos"],
      ["Collares", "/en/collares"],
    ]);
    expect(screen.getByRole("link", { name: "Artículo 7" })).toHaveAttribute(
      "href",
      "/en/productos/articulo-7"
    );
    expect(
      screen.getByRole("region", { name: "You may also like" })
    ).toBeVisible();
  });
});
