import { screen, within } from "@testing-library/react";
import type { ResolvedMetadata } from "next";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";
import { stubIntersectionObserver } from "@/test/intersection-observer";
import { stubReducedMotion } from "@/test/reduced-motion";

import ComingSoonPage, { generateMetadata } from "./page";

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

describe("ComingSoonPage", () => {
  test.each([
    ["en", "Openingsoon"],
    ["es", "Muypronto"],
  ] as const)(
    "in %s, renders the coming-soon screen in the language of the URL",
    async (locale, headline) => {
      const { page } = await setup({ locale });

      expect(page).toHaveAttribute("data-slot", "store-coming-soon");
      expect(
        within(page)
          .getByRole("heading", { level: 1 })
          .textContent.replaceAll(/\s+/g, "")
      ).toBe(headline);
    }
  );

  test("answers 404 for a language the product does not have", async () => {
    await expect(ComingSoonPage({ params: makeParams("fr") })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
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
