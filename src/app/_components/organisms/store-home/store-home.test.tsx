import { screen, within } from "@testing-library/react";
import useEmblaCarousel from "embla-carousel-react";
import { describe, expect, test, vi } from "vitest";

import type { StorePageArticle } from "@/app/_components/molecules/store-page-sections";
import type { Locale } from "@/lib/i18n/config";
import type { PageBanner, PageContentSection } from "@/lib/page/content";
import { createFakeEmbla } from "@/test/embla";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";
import { required } from "@/test/required";

import { StoreHome, type StoreHomeProps } from "./store-home";

// The carousels measure a layout happy-dom does not have.
vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

function makeBanner(overrides: Partial<PageBanner> = {}): PageBanner {
  return {
    ctaLabel: null,
    href: "/burbujeros",
    id: 31,
    image: { height: 1067, url: "/seed/bubble-gun-2.jpg", width: 1600 },
    lang: "es",
    phoneImage: {
      height: 1067,
      url: "/seed/bubble-gun-2-phone.jpg",
      width: 854,
    },
    title: "Burbujeros para toda la familia",
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
      priceAmount: 79_000,
      slug: "burbujero-pez",
      title: "Burbujero pez",
    },
  ],
  key: "best_sellers",
  kind: "best_sellers",
};

const TEXT = {
  description: "Bijouterie y burbujeros en la feria.",
  locale: "es",
  tagline: "Todo para regalar",
} as const;

function setup({
  content = { cover: [makeBanner()], sections: [ROW] },
  locale = "es",
  text = TEXT,
}: {
  content?: StoreHomeProps["content"];
  locale?: Locale;
  text?: StoreHomeProps["text"];
} = {}) {
  stubReducedMotion(false);
  vi.mocked(useEmblaCarousel).mockReturnValue(
    createFakeEmbla({
      // The cover's autoplay, which its own tests drive.
      plugins: { autoplay: { name: "autoplay", play: vi.fn(), stop: vi.fn() } },
      snaps: content.cover.length || 1,
    }).hook
  );
  renderWithI18n(
    <StoreHome
      browse={{ href: "/productos", label: "Ver el catálogo" }}
      content={content}
      copy={DICTIONARIES[locale].storefront}
      locale={locale}
      name="LR Market"
      text={text}
    />,
    { locale }
  );

  return {
    cover: () => screen.queryByTestId("store-home-cover"),
    view: screen.getByTestId("store-home-view"),
  };
}

describe("StoreHome", () => {
  test("opens on the cover, then the rows, under the store's name as the page's one h1, visually hidden", () => {
    const { cover, view } = setup();

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(screen.getAllByRole("heading", { level: 1 })).toEqual([h1]);
    expect(h1).toHaveTextContent(/^LR Market$/u);
    expect(h1).toHaveClass("sr-only");
    // The name first, then the cover's banner and the row, each an h2.
    expect(view.firstElementChild).toBe(h1);
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual(["Burbujeros para toda la familia", "Más vendidos"]);
    expect(view).toHaveAttribute("data-kind", "sections");
    expect(
      required(cover()).compareDocumentPosition(
        screen.getByTestId("store-page-section")
      )
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  test.each([
    ["es", "/burbujeros", "Comprar ahora"],
    ["en", "/en/burbujeros", "Shop now"],
  ] as const)(
    "in %s, the cover's banner leads to %s, is as tall as the cover and is the page's priority image, its phone crop on a phone",
    (locale, href, shopNow) => {
      const { cover } = setup({ locale });

      const banner = within(required(cover())).getByRole("link", {
        name: `Burbujeros para toda la familia ${shopNow}`,
      });
      expect(banner).toHaveAttribute("href", href);
      expect(banner).toHaveAttribute("data-size", "cover");
      const photo = required(banner.querySelector("img"));
      expect(photo).toHaveAttribute("fetchpriority", "high");
      expect(photo.getAttribute("src")).toContain(
        encodeURIComponent("/seed/bubble-gun-2-phone.jpg")
      );
    }
  );

  test("several cover banners are one carousel, each with its own words and link, or none", () => {
    const { cover } = setup({
      content: {
        cover: [
          makeBanner(),
          makeBanner({
            ctaLabel: "Ver las joyas",
            href: "https://instagram.com/lr",
            id: 32,
            title: "Joyas",
          }),
          makeBanner({ href: null, id: 33, title: "En la feria" }),
        ],
        sections: [ROW],
      },
    });

    const carousel = within(required(cover())).getByRole("region", {
      name: "Portada",
    });
    expect(
      within(carousel)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([
      ["Burbujeros para toda la familiaComprar ahora", "/burbujeros"],
      ["JoyasVer las joyas", "https://instagram.com/lr"],
    ]);
    expect(within(carousel).getByText("En la feria")).toBeInTheDocument();
  });

  test("with no banner in the cover, opens on its first row, whose banner below loads first if it leads", () => {
    const { cover } = setup({
      content: { cover: [], sections: [ROW] },
    });

    expect(cover()).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("sr-only");
    expect(
      screen.getByRole("heading", { level: 2, name: "Más vendidos" })
    ).toBeInTheDocument();
  });

  test("with no cover and a banner first, that banner is the page's priority image", () => {
    setup({
      content: {
        cover: [],
        sections: [
          { banner: makeBanner({ id: 40 }), key: "banner:40", kind: "banner" },
          ROW,
        ],
      },
    });

    expect(
      document.querySelector('[data-slot="store-banner"] img')
    ).toHaveAttribute("fetchpriority", "high");
  });

  test("a banner right under the cover keeps a gutter from it", () => {
    setup({
      content: {
        cover: [makeBanner()],
        sections: [
          { banner: makeBanner({ id: 40 }), key: "banner:40", kind: "banner" },
        ],
      },
    });

    expect(screen.getByTestId("store-page-section")).toHaveClass("mt-2.5");
  });

  test.each([
    ["es", "Todo para regalar"],
    ["en", "Todo para regalar"],
  ] as const)(
    "in %s, a store with nothing to show yet introduces itself: its name as a visible h1, its words and the way into its catalog",
    (locale, tagline) => {
      const { cover, view } = setup({
        content: { cover: [], sections: [] },
        locale,
      });

      expect(cover()).toBeNull();
      expect(view).toHaveAttribute("data-kind", "intro");
      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1).toHaveTextContent(/^LR Market$/u);
      expect(h1).not.toHaveClass("sr-only");
      expect(screen.getByText(tagline)).toHaveAttribute("lang", "es");
      expect(screen.getByTestId("store-description")).toHaveTextContent(
        TEXT.description
      );
      expect(
        screen.getByRole("link", { name: "Ver el catálogo" })
      ).toHaveAttribute("href", "/productos");
      expect(screen.queryByTestId("store-page-section")).toBeNull();
    }
  );

  test('"how to buy" alone is nothing to buy: the store still introduces itself (FER-076)', () => {
    const { view } = setup({
      content: {
        cover: [],
        sections: [{ key: "how_to_buy", kind: "how_to_buy" }],
      },
    });

    expect(view).toHaveAttribute("data-kind", "intro");
    expect(screen.queryByTestId("store-how-to-buy")).toBeNull();
  });

  test('beside a row, "how to buy" shows on the home', () => {
    const { view } = setup({
      content: {
        cover: [],
        sections: [{ key: "how_to_buy", kind: "how_to_buy" }, ROW],
      },
    });

    expect(view).toHaveAttribute("data-kind", "sections");
    expect(screen.getByTestId("store-how-to-buy")).toHaveAccessibleName(
      "Cómo comprar"
    );
  });

  test("a store with nothing to show and no texts still shows its name and the way in", () => {
    const { view } = setup({
      content: { cover: [], sections: [] },
      text: null,
    });

    expect(view).toHaveTextContent(/^LR MarketVer el catálogo$/u);
  });
});
