import { screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
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

vi.mock("next/navigation", () => ({ notFound }));

// Intl separates a currency from its amount with a no-break space.
const NBSP = "\u00A0";

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

  renderWithI18n(await DesignPage({ params: makeParams(locale) }), { locale });

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
        "Headings",
        "Chips and badges",
        "Price",
        "Arrow link",
        "Count-up",
        "Article card and slider",
        "Marquee band",
        "Reveal on scroll",
      ],
    ],
    [
      "es",
      "Sistema de diseño",
      [
        "Titulares",
        "Chips y avisos",
        "Precio",
        "Enlace con flecha",
        "Número que cuenta",
        "Tarjeta de artículo y carrusel",
        "Banda en movimiento",
        "Aparición al bajar",
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
          .map((heading) => heading.textContent)
      ).toEqual(sections);
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

  test("shows the filter chips as links, the first one current", async () => {
    await setup();

    const chips = within(screen.getByTestId("design-chips")).getAllByRole(
      "link"
    );
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
    expect(chips[0]).toHaveAttribute("data-selected", "true");
    expect(chips[1]).toHaveAttribute("data-selected", "false");
  });

  test.each([
    ["en", ["New", "Price drop"]],
    ["es", ["Nuevo", "Bajó de precio"]],
  ] as const)("in %s, shows both badges", async (locale, badges) => {
    await setup({ locale });

    expect(
      [
        ...screen
          .getByTestId("design-chips")
          .querySelectorAll('[data-slot="store-badge"]'),
      ].map((badge) => badge.textContent)
    ).toEqual(badges);
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
        section.querySelector('[data-slot="store-price-tag-previous"]')
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
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#cards",
      "#cards",
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

  test("shows six sample articles in the slider, one new and one reduced among them", async () => {
    await setup();
    const section = screen.getByTestId("design-cards");
    const cards = within(section).getAllByRole("article");

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
    ).toEqual(["New", "Price drop", null, null, null, "New"]);
    expect(
      cards.map(
        (card) =>
          card.querySelector('[data-slot="store-price-tag-amount"]')
            ?.textContent
      )
    ).toEqual([
      `UYU${NBSP}1,290`,
      `UYU${NBSP}890`,
      `UYU${NBSP}450`,
      `USD${NBSP}12.50`,
      `UYU${NBSP}390`,
      `UYU${NBSP}1,590`,
    ]);
    expect(
      within(section).getByRole("region", { name: "Sample articles" })
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("heading", { name: "Just arrived" })
    ).toHaveAttribute("data-size", "section");
    expect(
      section.querySelector('[data-slot="store-slider-position"]')?.textContent
    ).toBe("1 / 6");
  });

  test("shows the marquee in both tones", async () => {
    await setup();

    expect(
      [
        ...screen
          .getByTestId("design-marquee")
          .querySelectorAll<HTMLElement>('[data-slot="store-marquee"]'),
      ].map((marquee) => [
        marquee.dataset.tone,
        marquee.querySelector('[data-slot="store-marquee-track"]')
          ?.firstElementChild?.textContent,
      ])
    ).toEqual([
      ["contrast", "LR MarketJewelry and bubble gunsChristmas fair"],
      ["accent", "LR MarketJewelry and bubble gunsChristmas fair"],
    ]);
  });

  test("ends with a block that reveals on scroll", async () => {
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
