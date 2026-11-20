import { screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  resolveComingSoonContent,
  type StoredComingSoon,
  type StoreSocialLinks,
} from "@/lib/coming-soon/content";
import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { stubIntersectionObserver } from "@/test/intersection-observer";
import { stubReducedMotion } from "@/test/reduced-motion";

import { StoreComingSoon } from "./store-coming-soon";

// The countdown reads the request's clock on the server; it has its own tests.
vi.mock("next/server", () => ({
  connection: async () => {
    await Promise.resolve();
  },
}));

// The language toggle reads the URL, which exists only inside a Next render.
vi.mock("next/navigation", () => ({
  usePathname: () => "/coming-soon",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/** Nothing saved: every text the dictionary's, counting to the fair. */
const UNSAVED: StoredComingSoon = { countdownTo: null, translations: [] };

function setup({
  locale = "en",
  store = null,
  stored = UNSAVED,
}: {
  locale?: Locale;
  store?: StoreSocialLinks | null;
  stored?: StoredComingSoon;
} = {}) {
  stubIntersectionObserver();
  stubReducedMotion(false);
  const copy = DICTIONARIES[locale].comingSoon;

  renderWithI18n(
    <StoreComingSoon
      content={resolveComingSoonContent(copy, stored, locale, store)}
      copy={copy}
    />,
    { locale }
  );

  return { page: screen.getByTestId("coming-soon-page") };
}

describe("StoreComingSoon", () => {
  test.each([
    [
      "en",
      "Openingsoon",
      "Christmas fair · December 5 to January 5",
      "Jewelry and bubble guns. We are setting up the store: follow us and find out when it opens.",
    ],
    [
      "es",
      "Muypronto",
      "Feria navideña · 5 de diciembre al 5 de enero",
      "Bijou y pistolas de burbujas. Estamos armando la tienda: seguinos y enterate cuando abra.",
    ],
  ] as const)(
    "in %s, says the store opens soon under one giant headline, with the fair's dates",
    (locale, headline, eyebrow, lead) => {
      const { page } = setup({ locale });
      const heading = within(page).getByRole("heading", { level: 1 });

      expect(heading.textContent.replaceAll(/\s+/g, "")).toBe(headline);
      expect(heading).toHaveAttribute("data-size", "hero");
      expect(within(page).getByText(eyebrow)).toBeInTheDocument();
      expect(within(page).getByText(lead)).toBeInTheDocument();
      expect(within(page).getAllByRole("heading")).toHaveLength(1);
    }
  );

  test("paints the storefront's contrast canvas at full height", () => {
    const { page } = setup();

    // The header is a banner and the copy the main landmark: siblings.
    expect(within(page).getByRole("banner").parentElement).toBe(page);
    expect(within(page).getByRole("main").parentElement).toBe(page);
    expect(within(page).getByRole("main")).toContainElement(
      within(page).getByRole("heading", { level: 1 })
    );
    expect(page).toHaveAttribute("data-slot", "store-coming-soon");
    expect(page).toHaveClass(
      "min-h-screen",
      "bg-store-contrast",
      "text-store-background",
      // The bubbles are drawn over, and clipped by, this element.
      "relative"
    );
  });

  test("the full logo blows bubbles: it is a button, with a first burst already in the page", () => {
    const { page } = setup();
    const button = within(page).getByRole("button", {
      name: "LR Market: make bubbles",
    });
    const logo = button.querySelector('[data-slot="store-logo"]');

    // The tag with LR and MARKET: the mark alone is only the tab's icon.
    expect(logo).toHaveAttribute("data-variant", "full");
    expect(logo).toHaveClass("h-14", "md:h-16");
    expect(
      page.querySelectorAll('[data-slot="store-bubble"]').length
    ).toBeGreaterThan(0);
  });

  test.each([
    ["en", "Follow us on Instagram", "Follow us on TikTok"],
    ["es", "Seguinos en Instagram", "Seguinos en TikTok"],
  ] as const)(
    "in %s, links to Instagram and TikTok in a new tab that cannot reach back",
    (locale, instagram, tiktok) => {
      const { page } = setup({ locale });

      for (const [name, href] of [
        [instagram, "https://www.instagram.com/lrmarket"],
        [tiktok, "https://www.tiktok.com/@lrmarket"],
      ] as const) {
        const link = within(page).getByRole("link", { name });

        expect(link).toHaveAttribute("href", href);
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
        expect(link).toHaveAttribute("data-tone", "contrast");
      }
    }
  );

  test("offers the other language, in the accent that reads on the contrast canvas", () => {
    const { page } = setup({ locale: "es" });
    const toggle = within(page).getByRole("link", { name: "English" });

    expect(toggle).toHaveAttribute("href", "/en/coming-soon");
    expect(toggle).toHaveClass("min-h-11");
    expect(
      toggle.querySelector('[data-slot="locale-toggle-thumb"]')
    ).toHaveClass("bg-store-accent");
  });

  test.each([
    [
      "en",
      "LR MarketJewelry and bubble gunsChristmas fairDec 5 to Jan 5",
      "Pause the moving band",
    ],
    [
      "es",
      "LR MarketBijou y pistolas de burbujasFeria navideña5 dic al 5 ene",
      "Pausar la banda en movimiento",
    ],
  ] as const)(
    "in %s, ends with the accent marquee: the brand, what it sells and when, with its pause",
    (locale, phrases, pause) => {
      const { page } = setup({ locale });
      const marquee = page.querySelector('[data-slot="store-marquee"]');
      const firstCopy = marquee?.querySelector(
        '[data-slot="store-marquee-track"]'
      )?.firstElementChild;

      expect(marquee).toHaveAttribute("data-tone", "accent");
      expect(marquee).toBe(page.lastElementChild);
      expect(firstCopy?.textContent).toBe(phrases);
      expect(
        within(page).getByRole("button", { name: pause })
      ).toBeInTheDocument();
    }
  );

  test("shows what an admin wrote: the eyebrow, the headline's lines, the text under it and the band's phrases after the brand", () => {
    const { page } = setup({
      locale: "es",
      store: {
        instagramUrl: "https://instagram.com/e2e-market",
        tiktokUrl: null,
      },
      stored: {
        countdownTo: "2026-12-20",
        translations: [
          {
            eyebrow: "Feria · desde el 20 de diciembre",
            headline: "Abrimos\nel sábado",
            lead: "Te esperamos en la feria.",
            locale: "es",
            marquee: "Bijou\nBurbujas",
          },
        ],
      },
    });
    const heading = within(page).getByRole("heading", { level: 1 });
    const lines = [
      ...heading.querySelectorAll('[data-slot="store-heading-line-text"]'),
    ];

    expect(lines.map((line) => line.textContent)).toEqual([
      "Abrimos",
      "el sábado",
    ]);
    // The second line takes the accent, as the dictionary's does.
    expect(lines[1]).toHaveClass("text-store-accent");
    // A long word breaks inside the phone's width instead of widening it.
    expect(heading).toHaveClass("[overflow-wrap:anywhere]");
    expect(within(page).getByTestId("coming-soon-lead")).toHaveTextContent(
      "Te esperamos en la feria."
    );
    expect(
      within(page).getByText("Feria · desde el 20 de diciembre")
    ).toBeInTheDocument();
    // The store's Instagram; the brand's TikTok, the store having none.
    expect(
      within(page).getByRole("link", { name: "Seguinos en Instagram" })
    ).toHaveAttribute("href", "https://instagram.com/e2e-market");
    expect(
      within(page).getByRole("link", { name: "Seguinos en TikTok" })
    ).toHaveAttribute("href", "https://www.tiktok.com/@lrmarket");
    expect(
      page.querySelector('[data-slot="store-marquee-track"]')?.firstElementChild
        ?.textContent
    ).toBe("LR MarketBijouBurbujas");
  });

  test("holds the countdown's height while it streams in, so nothing below it jumps", () => {
    setup();

    // Until the request's clock is read there is no figure, only its room.
    expect(screen.getByTestId("fair-countdown-fallback")).toHaveClass(
      "min-h-24"
    );
    expect(screen.queryByTestId("fair-countdown")).not.toBeInTheDocument();
  });
});
