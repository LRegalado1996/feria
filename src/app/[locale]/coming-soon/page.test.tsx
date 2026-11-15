import { screen, within } from "@testing-library/react";
import type { ResolvedMetadata } from "next";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";
import { stubIntersectionObserver } from "@/test/intersection-observer";
import { stubReducedMotion } from "@/test/reduced-motion";

import ComingSoonPage, { FairCountdown, generateMetadata } from "./page";

const { connection, notFound } = vi.hoisted(() => ({
  connection: vi.fn(async () => {
    await Promise.resolve();
  }),
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({ connection }));

// The language toggle reads the URL, which exists only inside a Next render.
vi.mock("next/navigation", () => ({
  notFound,
  usePathname: () => "/coming-soon",
  useSearchParams: () => new URLSearchParams(),
}));

const THREE_WEEKS_BEFORE = new Date("2026-11-14T15:00:00.000Z");

const SHARE_CARD = {
  alt: "LR Market",
  height: 630,
  url: "http://localhost:3000/es/opengraph-image",
  width: 1200,
};

/** The metadata resolved above the page: only its share card is read. */
async function makeParent(images: (typeof SHARE_CARD)[] | null) {
  const parent: Pick<ResolvedMetadata, "openGraph"> = {
    openGraph:
      images === null
        ? null
        : {
            images,
            title: { absolute: "LR Market", template: null },
            type: "website",
            url: null,
          },
  };

  return await Promise.resolve(parent);
}

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

async function setup({ locale = "en" }: { locale?: Locale } = {}) {
  stubIntersectionObserver();
  stubReducedMotion(false);

  renderWithI18n(await ComingSoonPage({ params: makeParams(locale) }), {
    locale,
  });

  return { page: screen.getByTestId("coming-soon-page") };
}

async function setupCountdown(now: Date, locale: Locale = "en") {
  vi.setSystemTime(now);
  stubIntersectionObserver();
  stubReducedMotion(false);

  const copy =
    locale === "en"
      ? { many: "days until the fair", one: "day until the fair" }
      : { many: "días para la feria", one: "día para la feria" };

  renderWithI18n(<div>{await FairCountdown({ copy })}</div>, { locale });

  return { countdown: screen.queryByTestId("fair-countdown") };
}

describe("ComingSoonPage", () => {
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
    async (locale, headline, eyebrow, lead) => {
      const { page } = await setup({ locale });
      const heading = within(page).getByRole("heading", { level: 1 });

      expect(heading.textContent.replaceAll(/\s+/g, "")).toBe(headline);
      expect(heading).toHaveAttribute("data-size", "hero");
      expect(within(page).getByText(eyebrow)).toBeInTheDocument();
      expect(within(page).getByText(lead)).toBeInTheDocument();
      expect(within(page).getAllByRole("heading")).toHaveLength(1);
    }
  );

  test("paints the storefront's contrast canvas at full height", async () => {
    const { page } = await setup();

    // The header is a banner and the copy the main landmark: siblings.
    expect(within(page).getByRole("banner").parentElement).toBe(page);
    expect(within(page).getByRole("main").parentElement).toBe(page);
    expect(within(page).getByRole("main")).toContainElement(
      within(page).getByRole("heading", { level: 1 })
    );
    expect(page).toHaveClass(
      "min-h-screen",
      "bg-store-contrast",
      "text-store-background",
      // The bubbles are drawn over, and clipped by, this element.
      "relative"
    );
  });

  test("the logo's mark blows bubbles: it is a button, with a first burst already in the page", async () => {
    const { page } = await setup();
    const button = within(page).getByRole("button", { name: "Make bubbles" });
    const logo = button.querySelector('[data-slot="store-logo"]');

    expect(logo).toHaveAttribute("data-variant", "mark");
    expect(logo).toHaveClass("h-12");
    expect(
      page.querySelectorAll('[data-slot="store-bubble"]').length
    ).toBeGreaterThan(0);
  });

  test.each([
    ["en", "Follow us on Instagram", "Follow us on TikTok"],
    ["es", "Seguinos en Instagram", "Seguinos en TikTok"],
  ] as const)(
    "in %s, links to Instagram and TikTok in a new tab that cannot reach back",
    async (locale, instagram, tiktok) => {
      const { page } = await setup({ locale });

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

  test("offers the other language, readable on the contrast canvas", async () => {
    const { page } = await setup({ locale: "es" });
    const toggle = within(page).getByRole("link", { name: "English" });

    expect(toggle).toHaveAttribute("href", "/en/coming-soon");
    expect(toggle).toHaveClass("text-store-background", "min-h-11");
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
    async (locale, phrases, pause) => {
      const { page } = await setup({ locale });
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

  test("holds the countdown's height while it streams in, so nothing below it jumps", async () => {
    await setup();

    const slot = screen.getByTestId("fair-countdown-slot");

    expect(slot).toHaveClass("min-h-24");
    // Until the request's clock is read there is no figure, only the room.
    expect(slot).toBeEmptyDOMElement();
  });

  test("answers 404 for a language the product does not have", async () => {
    await expect(ComingSoonPage({ params: makeParams("fr") })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });
});

describe("FairCountdown", () => {
  test.each([
    ["en", "21", "days until the fair"],
    ["es", "21", "días para la feria"],
  ] as const)(
    "in %s, three weeks before, counts 21 days after reading the request's clock",
    async (locale, figure, label) => {
      const { countdown } = await setupCountdown(THREE_WEEKS_BEFORE, locale);

      expect(connection).toHaveBeenCalledExactlyOnceWith();
      const count = countdown?.querySelector('[data-slot="store-count-up"]');

      // The figure a screen reader gets, then its label.
      expect(count?.firstElementChild).toHaveTextContent(figure);
      expect(count).toHaveClass("font-display", "text-store-accent");
      expect(count?.nextElementSibling).toHaveTextContent(label);
    }
  );

  test("the evening before, it is one day, in the singular", async () => {
    const { countdown } = await setupCountdown(
      new Date("2026-12-04T23:00:00.000Z")
    );

    expect(
      countdown?.querySelector('[data-slot="store-count-up"]')
        ?.firstElementChild
    ).toHaveTextContent("1");
    expect(countdown?.lastElementChild?.textContent).toBe("day until the fair");
  });

  test.each([
    ["at the opening", "2026-12-05T03:00:00.000Z"],
    ["during the fair", "2026-12-20T12:00:00.000Z"],
  ])("%s, there is nothing to count", async (_name, now) => {
    const { countdown } = await setupCountdown(new Date(now));

    expect(countdown).not.toBeInTheDocument();
  });
});

describe("generateMetadata", () => {
  test("declares no image, rather than fail, under a parent that has none", async () => {
    const metadata = await generateMetadata(
      { params: makeParams("es") },
      makeParent(null)
    );

    expect(metadata.openGraph?.images).toEqual([]);
  });

  test.each([
    [
      "en",
      "Opening soon · LR Market",
      "LR Market opens soon: jewelry and bubble guns, at the Christmas fair from December 5 to January 5 and online.",
      "/en/coming-soon",
    ],
    [
      "es",
      "Muy pronto · LR Market",
      "LR Market abre muy pronto: bijou y pistolas de burbujas, en la feria navideña del 5 de diciembre al 5 de enero y en línea.",
      "/coming-soon",
    ],
  ] as const)(
    "in %s, titles the page and its share card, keeps it out of search engines and declares both languages",
    async (locale, title, description, canonical) => {
      expect(
        await generateMetadata(
          { params: makeParams(locale) },
          makeParent([SHARE_CARD])
        )
      ).toEqual({
        alternates: {
          canonical,
          languages: {
            en: "/en/coming-soon",
            es: "/coming-soon",
            "x-default": "/coming-soon",
          },
        },
        description,
        openGraph: {
          description,
          // The layout's share card, carried over.
          images: [SHARE_CARD],
          siteName: "LR Market",
          title,
          type: "website",
        },
        robots: { follow: false, index: false },
        title,
      });
    }
  );
});
