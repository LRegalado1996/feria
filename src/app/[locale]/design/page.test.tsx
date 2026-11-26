import { act, screen, within } from "@testing-library/react";
import useEmblaCarousel from "embla-carousel-react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createFakeEmbla } from "@/test/embla";
import { renderWithI18n } from "@/test/i18n";
import { stubIntersectionObserver } from "@/test/intersection-observer";
import { stubReducedMotion } from "@/test/reduced-motion";

import DesignPage, { generateMetadata } from "./page";

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The gallery's header holds the language link and the search, which read
// the URL and the router.
vi.mock("next/navigation", () => ({
  notFound,
  usePathname: () => "/design",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// The row and the cover measure a layout happy-dom does not have.
vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));
vi.mock("embla-carousel-autoplay", () => ({
  default: vi.fn(() => ({ name: "autoplay", play: vi.fn(), stop: vi.fn() })),
}));

// Intl separates a currency from its amount with a no-break space.
const NBSP = " ";

// Every variable the gate reads, cleared, so the machine running the test
// cannot leak its own Vercel environment in.
const UNSET = {
  VERCEL_ENV: "",
  VERCEL_GIT_COMMIT_REF: "",
  VERCEL_TARGET_ENV: "",
};

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

function stubEnvironment(env: Partial<typeof UNSET> = {}) {
  for (const [name, value] of Object.entries({ ...UNSET, ...env })) {
    vi.stubEnv(name, value);
  }
}

async function setup({
  env = {},
  locale = "en",
}: { env?: Partial<typeof UNSET>; locale?: Locale } = {}) {
  stubEnvironment(env);
  stubIntersectionObserver();
  stubReducedMotion(false);
  // One stand-in for both carousels: a new one each render would never
  // settle, as Embla's own API is the same object for a carousel's life.
  vi.mocked(useEmblaCarousel).mockReturnValue(
    createFakeEmbla({
      plugins: { autoplay: { play: vi.fn(), stop: vi.fn() } },
      snaps: 3,
    }).hook
  );
  const page = await DesignPage({ params: makeParams(locale) });

  // Awaited: the sample header's categories resolve as a stream would.
  await act(async () => {
    renderWithI18n(page, { locale });
    await Promise.resolve();
  });

  return { page: screen.getByTestId("design-page") };
}

describe("DesignPage", () => {
  test.each([
    ["the Vercel production deployment", { VERCEL_ENV: "production" }],
    ["the production branch", { VERCEL_GIT_COMMIT_REF: "main" }],
    ["a production target", { VERCEL_TARGET_ENV: "production" }],
  ] as const)("answers 404 on %s", async (_label, env) => {
    stubEnvironment(env);

    await expect(DesignPage({ params: makeParams("en") })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(notFound).toHaveBeenCalledExactlyOnceWith();
  });

  test.each([
    ["a build with no Vercel variables", {}],
    ["a branch preview", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "x" }],
    ["qa", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }],
  ] as const)("renders on %s", async (_label, env) => {
    const { page } = await setup({ env });

    expect(notFound).not.toHaveBeenCalled();
    expect(within(page).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Design system"
    );
  });

  test("answers 404 for a language the product does not have", async () => {
    stubEnvironment();

    await expect(DesignPage({ params: makeParams("fr") })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  test.each([
    [
      "en",
      "Design system",
      [
        "Logo",
        "Colors",
        "Headings",
        "Buttons",
        "Chips and labels",
        "Price",
        "Arrow link",
        "Count-up",
        "Row of articles",
        "Banner",
        "Article spotlight",
        "How to buy",
        "Moving cover",
        "Marquee band",
        "Bubbles",
        "Reveal on scroll",
        "Bar, header and footer",
      ],
    ],
    [
      "es",
      "Sistema de diseño",
      [
        "Logo",
        "Colores",
        "Titulares",
        "Botones",
        "Chips y etiquetas",
        "Precio",
        "Enlace con flecha",
        "Número que cuenta",
        "Fila de artículos",
        "Banner",
        "Artículo en vidriera",
        "Cómo comprar",
        "Portada que se mueve",
        "Banda en movimiento",
        "Burbujas",
        "Aparición al bajar",
        "Barra, encabezado y pie",
      ],
    ],
  ] as const)(
    "in %s, is titled %j and has one section per component",
    async (locale, title, sections) => {
      const { page } = await setup({ locale });

      expect(within(page).getByRole("heading", { level: 1 })).toHaveTextContent(
        title
      );
      expect(
        within(page)
          .getAllByRole("heading", { level: 2 })
          .filter((heading) => !heading.closest('[data-slot="store-footer"]'))
          .map((heading) => heading.textContent)
      ).toEqual(sections);
    }
  );

  test('shows the "how to buy" block: its title for a screen reader and its four steps', async () => {
    await setup();

    const block = within(screen.getByTestId("design-how-to-buy"));

    expect(
      block.getByRole("heading", { level: 3, name: "How to buy" })
    ).toBeInTheDocument();
    expect(
      block.getAllByRole("listitem").map((item) => item.textContent)
    ).toEqual([
      "ChooseBrowse the catalog on the site.",
      "Add to cartLeave your name and mobile.",
      "We deliver itAt the stall, or we send it.",
      "Pay your wayWe take every way to pay.",
    ]);
  });

  test("shows the article spotlight: the name, its pill, its phrase, and the button that adds it", async () => {
    await setup();

    const block = within(screen.getByTestId("design-spotlight"));

    expect(
      block.getByRole("heading", { level: 3, name: "Bubble gun with lights" })
    ).toBeVisible();
    expect(block.getByText("New")).toBeVisible();
    expect(
      block.getByText(
        "Lights and bubbles that never stop. The one people ask for most at the fair."
      )
    ).toBeVisible();
    expect(
      block.getByRole("button", {
        name: "Add to cart: Bubble gun with lights",
      })
    ).toBeVisible();
  });

  test("shows the full logo on the tile and on the moss, in both tones, at the sizes the store uses, and the mark alone", async () => {
    await setup();

    const logos = within(screen.getByTestId("design-logo")).getAllByRole(
      "img",
      { name: "LR Market" }
    );

    expect(
      logos.map((logo) => [
        logo.dataset.variant,
        logo.dataset.tone,
        logo.parentElement?.className.match(/bg-store-\w+/)?.[0],
        logo.getAttribute("class")?.match(/\bh-[\d.]+/)?.[0],
      ])
    ).toEqual([
      ["full", "accent", "bg-store-surface", "h-32"],
      ["full", "accent", "bg-store-contrast", "h-32"],
      ["full", "contrast", "bg-store-surface", "h-32"],
      ["full", "accent", "bg-store-contrast", "h-10"],
      ["full", "accent", "bg-store-contrast", "h-12.5"],
      ["full", "accent", "bg-store-contrast", "h-15.5"],
      ["mark", "accent", "bg-store-contrast", "h-8"],
    ]);
  });

  test.each([
    ["en", "White: the page"],
    ["es", "Blanco: la página"],
  ] as const)(
    "in %s, shows the five colors and the three derived, each named by its token",
    async (locale, background) => {
      await setup({ locale });
      const palette = screen.getByTestId("design-palette");

      expect(
        within(palette)
          .getAllByRole("listitem")
          .map((item) => item.querySelector(".font-mono")?.textContent)
      ).toEqual([
        "store-background",
        "store-surface",
        "store-foreground",
        "store-contrast",
        "store-accent",
        "store-muted",
        "store-line",
      ]);
      expect(within(palette).getByText(background)).toBeVisible();
      expect(
        within(palette).getAllByRole("listitem")[3]?.firstElementChild
      ).toHaveClass("bg-store-contrast");
    }
  );

  test("paints the storefront canvas, not the admin's", async () => {
    const { page } = await setup();

    expect(page).toHaveClass("bg-store-background", "text-store-foreground");
  });

  test("shows the display headings with their accent line on the contrast blocks", async () => {
    await setup();

    const hero = within(screen.getByTestId("design-type")).getByRole(
      "heading",
      { name: "See you at the fair" }
    );
    expect(hero).toHaveAttribute("data-size", "hero");
    expect(
      hero.querySelectorAll('[data-slot="store-heading-line-text"]')[1]
    ).toHaveClass("text-store-accent");
  });

  test("shows every kind of button: the pills, the round arrow, and those on the moss", async () => {
    await setup();
    const buttons = within(screen.getByTestId("design-buttons")).getAllByRole(
      "button"
    );

    expect(
      buttons.map((button) => [
        button.getAttribute("aria-label") ?? button.textContent,
        button.dataset.variant,
        button.dataset.size,
      ])
    ).toEqual([
      ["Add to cart", "primary", "lg"],
      ["See the catalog", "outline", "md"],
      ["Clear", "ghost", "md"],
      ["Add to cart", "accent", "icon-lg"],
      ["On the moss", "contrast", "md"],
      ["Search the store", "contrast", "icon"],
    ]);
  });

  test("shows the filter chips as links, the first one current, and the new label on the tile", async () => {
    await setup();
    const section = screen.getByTestId("design-chips");

    const chips = within(section).getAllByRole("link");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "All",
      "Necklaces",
      "Rings",
      "Bubbles",
    ]);
    expect(chips.map((chip) => chip.getAttribute("aria-current"))).toEqual([
      "true",
      null,
      null,
      null,
    ]);
    expect(
      section.querySelector('[data-slot="store-badge"]')
    ).toHaveTextContent(/^New$/u);
  });

  test.each([
    [
      "en",
      [`UYU${NBSP}1,290`, `USD${NBSP}12.50`, `UYU${NBSP}890`],
      `Was UYU${NBSP}1,290`,
    ],
    [
      "es",
      [`$${NBSP}1.290`, `US$${NBSP}12,50`, `$${NBSP}890`],
      `Antes $${NBSP}1.290`,
    ],
  ] as const)(
    "in %s, shows a large, a small and a reduced price",
    async (locale, amounts, previous) => {
      await setup({ locale });
      const section = screen.getByTestId("design-price");

      expect(
        [
          ...section.querySelectorAll('[data-slot="store-price-tag-amount"]'),
        ].map((amount) => amount.textContent)
      ).toEqual(amounts);
      expect(
        [
          ...section.querySelectorAll<HTMLElement>(
            '[data-slot="store-price-tag"]'
          ),
        ].map((tag) => tag.dataset.size)
      ).toEqual(["lg", "sm", "sm"]);
      expect(
        section.querySelector('[data-slot="store-price-tag-previous"] .sr-only')
          ?.textContent
      ).toBe(previous);
    }
  );

  test("shows the arrow link in both tones", async () => {
    await setup();

    const links = within(screen.getByTestId("design-link")).getAllByRole(
      "link",
      { name: "See every article" }
    );
    expect(links.map((link) => link.dataset.tone)).toEqual([
      "default",
      "contrast",
    ]);
  });

  test("shows the count-up at its final figure, with its label", async () => {
    await setup();
    const section = screen.getByTestId("design-count-up");

    expect(
      section.querySelector('[data-slot="store-count-up-figure"]')?.textContent
    ).toBe("128");
    expect(within(section).getByText("sample articles")).toBeInTheDocument();
  });

  test("shows six sample articles in a row, on the seed's photos, one new, one reduced and one sold out", async () => {
    await setup();
    const section = screen.getByTestId("design-cards");
    const row = within(section).getByRole("region", { name: "Just arrived" });
    const cards = within(row).getAllByRole("article");

    expect(
      cards.map((card) => within(card).getByRole("link").textContent)
    ).toEqual([
      "Pearl necklace",
      "Bubble gun with lights",
      "Adjustable ring",
      "Thread bracelet",
      "Hoop earrings",
      "Gold chain",
    ]);
    expect(
      cards.map(
        (card) =>
          card.querySelector('[data-slot="store-badge"]')?.textContent ?? null
      )
    ).toEqual(["New", null, null, null, null, "New"]);
    expect(cards.map((card) => card.querySelector("p")?.textContent)).toEqual([
      `UYU${NBSP}1,290`,
      `UYU${NBSP}1,290Was UYU${NBSP}1,290UYU${NBSP}890`,
      `UYU${NBSP}450`,
      `USD${NBSP}12.50`,
      "Sold out",
      `UYU${NBSP}1,590`,
    ]);
    expect(cards[0]?.querySelector("img")?.getAttribute("src")).toContain(
      "necklace-1.jpg"
    );
    expect(
      within(section).getByRole("link", { name: "See all: Just arrived" })
    ).toHaveAttribute("href", "#cards");
  });

  test("shows a banner, and the cover of three banners that moves on its own with a pause", async () => {
    await setup();

    expect(
      within(screen.getByTestId("design-banner")).getByRole("link", {
        name: "Earrings for every day Shop now",
      })
    ).toHaveAttribute("href", "#cover");
    const cover = within(screen.getByTestId("design-cover")).getByRole(
      "region",
      { name: "Cover" }
    );
    // Each banner's words (its title, then the call to shop) and where it
    // leads, slide by slide.
    expect(
      within(cover)
        .getAllByRole("group")
        .map((slide) => {
          const banner = within(slide).getByRole("link");

          return [banner.textContent, banner.getAttribute("href")];
        })
    ).toEqual([
      ["Bubbles for the whole fairShop now", "#cover"],
      ["Earrings for every dayShop now", "#cover"],
      ["Rings that shineShop now", "#cover"],
    ]);
    expect(
      within(cover).getByRole("button", { name: "Pause the cover" })
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("shows the marquee in both tones", async () => {
    await setup();

    expect(
      [
        ...screen
          .getByTestId("design-marquee")
          .querySelectorAll<HTMLElement>('[data-slot="store-marquee"]'),
      ].map((marquee) => marquee.dataset.tone)
    ).toEqual(["contrast", "accent"]);
  });

  test("shows the bubbles blown from the full logo, on a contrast block that holds the burst", async () => {
    await setup();

    const section = screen.getByTestId("design-bubbles");
    const button = within(section).getByRole("button", {
      name: "LR Market: make bubbles",
    });

    expect(button.parentElement).toHaveClass("relative", "bg-store-contrast");
    expect(button.querySelector('[data-slot="store-logo"]')).toHaveAttribute(
      "data-variant",
      "full"
    );
  });

  test("shows the bar, the header with sample categories, not sticky, and the footer with every link", async () => {
    const { page } = await setup({ locale: "es" });
    const shell = within(within(page).getByTestId("design-shell"));

    expect(shell.getByTestId("store-announcement-bar")).toHaveTextContent(
      "Encontranos en la feria · del 5/12 al 5/1"
    );
    expect(shell.getByTestId("store-header")).toHaveClass("static");
    expect(
      within(shell.getByRole("navigation", { name: "Secciones de la tienda" }))
        .getAllByRole("link")
        .map((link) => link.textContent)
      // The group is one control, and its links wait behind it (FER-044).
    ).toEqual(["Catálogo", "Burbujeros"]);
    expect(
      within(
        shell.getByRole("navigation", { name: "Secciones de la tienda" })
      ).getByRole("button", { name: "Bijouterie" })
    ).toHaveAttribute("aria-expanded", "false");
    // Its skip link leads to the gallery's own content.
    expect(page.id).not.toBe("");
    expect(
      within(shell.getByTestId("store-header")).getByRole("link", {
        name: "Saltar al contenido",
      })
    ).toHaveAttribute("href", `#${page.id}`);
    expect(page).toHaveAttribute("tabindex", "-1");
    expect(
      within(shell.getByTestId("store-footer"))
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
        .filter((href) => href?.startsWith("https://"))
    ).toEqual([
      "https://wa.me/59899000000",
      "https://www.instagram.com/lrmarket",
      "https://www.tiktok.com/@lrmarket",
      "https://lucasregalado.com",
    ]);
  });

  test("shows a block that reveals on scroll", async () => {
    await setup();
    const reveal = screen
      .getByTestId("design-reveal")
      .querySelector('[data-slot="store-reveal"]');

    expect(reveal).toHaveAttribute("data-state", "idle");
    expect(reveal).toHaveTextContent(
      "This block rises and fades in once, when it scrolls into view."
    );
  });
});

describe("generateMetadata", () => {
  test.each([
    ["en", "Storefront design system", "/en/design"],
    ["es", "Sistema de diseño de la tienda", "/design"],
  ] as const)(
    "in %s, titles the page, keeps it out of search engines and declares its alternates",
    async (locale, title, canonical) => {
      const metadata = await generateMetadata({ params: makeParams(locale) });

      expect(metadata.title).toBe(title);
      expect(metadata.robots).toEqual({ follow: false, index: false });
      expect(metadata.alternates).toEqual({
        canonical,
        languages: {
          en: "/en/design",
          es: "/design",
          "x-default": "/design",
        },
      });
    }
  );
});
