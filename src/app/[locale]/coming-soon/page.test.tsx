import { screen, within } from "@testing-library/react";
import type { ResolvedMetadata } from "next";
import { describe, expect, test, vi } from "vitest";

import type {
  StoredComingSoon,
  StoreSocialLinks,
} from "@/lib/coming-soon/content";
import type { Locale } from "@/lib/i18n/config";
import { holdRequest, settle } from "@/test/connection";
import { renderWithI18n } from "@/test/i18n";
import { stubIntersectionObserver } from "@/test/intersection-observer";
import { stubReducedMotion } from "@/test/reduced-motion";

import ComingSoonPage, { generateMetadata, instant } from "./page";

const {
  captureExceptionWithScope,
  connection,
  notFound,
  readComingSoon,
  readStore,
} = vi.hoisted(() => ({
  captureExceptionWithScope: vi.fn<
    (error: unknown, scope: { action: string }) => string | null
  >(() => null),
  connection: vi.fn(async () => {
    await Promise.resolve();
  }),
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  readComingSoon: vi.fn<() => Promise<StoredComingSoon>>(),
  readStore: vi.fn<() => Promise<StoreSocialLinks | null>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({ connection }));

vi.mock("@/server/cache/coming-soon", () => ({ readComingSoon }));

vi.mock("@/server/cache/store", () => ({ readStore }));

vi.mock("@/lib/sentry", () => ({ captureExceptionWithScope }));

// The language toggle reads the URL, which exists only inside a Next render.
vi.mock("next/navigation", () => ({
  notFound,
  usePathname: () => "/coming-soon",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const SHARE_CARD = {
  alt: "LR Market",
  height: 630,
  url: "http://localhost:3000/es/opengraph-image",
  width: 1200,
};

/** What an admin saved: a Spanish headline only. */
const SAVED: StoredComingSoon = {
  countdownTo: "2026-12-20",
  translations: [
    {
      eyebrow: null,
      headline: "Abrimos\npronto",
      lead: null,
      locale: "es",
      marquee: null,
    },
  ],
};

/** The store's settings: an Instagram, no TikTok. */
const STORE_LINKS: StoreSocialLinks = {
  instagramUrl: "https://instagram.com/e2e-market",
  tiktokUrl: null,
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

async function setup({
  locale = "en",
  saved = SAVED,
  store = STORE_LINKS,
}: {
  locale?: Locale;
  saved?: StoredComingSoon | Error;
  store?: StoreSocialLinks | Error;
} = {}) {
  stubIntersectionObserver();
  stubReducedMotion(false);
  if (saved instanceof Error) {
    readComingSoon.mockRejectedValue(saved);
  } else {
    readComingSoon.mockResolvedValue(saved);
  }
  if (store instanceof Error) {
    readStore.mockRejectedValue(store);
  } else {
    readStore.mockResolvedValue(store);
  }

  renderWithI18n(await ComingSoonPage({ params: makeParams(locale) }), {
    locale,
  });

  const page = screen.getByTestId("coming-soon-page");

  return {
    headline: within(page)
      .getByRole("heading", { level: 1 })
      .textContent.replaceAll(/\s+/g, ""),
    page,
    /** Where each "Seguinos" link leads, Instagram then TikTok. */
    social: within(page)
      .getAllByRole("link", { name: /Instagram|TikTok/u })
      .map((link) => link.getAttribute("href")),
  };
}

describe("ComingSoonPage", () => {
  test.each([
    // The admin's Spanish headline, never shown to an English reader.
    ["en", "Openingsoon"],
    ["es", "Abrimospronto"],
  ] as const)(
    "in %s, renders the coming-soon screen with what was saved in that language, else the dictionary's",
    async (locale, headline) => {
      const { headline: shown, page } = await setup({ locale });

      expect(page).toHaveAttribute("data-slot", "store-coming-soon");
      expect(shown).toBe(headline);
      expect(readComingSoon).toHaveBeenCalledExactlyOnceWith();
    }
  );

  test("links the store's own social profiles, the brand's where the store has none", async () => {
    const { social } = await setup({ locale: "es" });

    expect(social).toEqual([
      "https://instagram.com/e2e-market",
      "https://www.tiktok.com/@lrmarket",
    ]);
    expect(readStore).toHaveBeenCalledExactlyOnceWith();
  });

  test("links the brand's profiles when the store cannot be read, and reports it", async () => {
    const outage = new Error("connection refused");
    const { headline, social } = await setup({ locale: "es", store: outage });

    // The texts still come from the page as saved.
    expect(headline).toBe("Abrimospronto");
    expect(social).toEqual([
      "https://www.instagram.com/lrmarket",
      "https://www.tiktok.com/@lrmarket",
    ]);
    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(outage, {
      action: "ComingSoon.read_store",
    });
  });

  test("reads the saved page and the store only once a request is there: the build has no database", async () => {
    readComingSoon.mockResolvedValue(SAVED);
    readStore.mockResolvedValue(STORE_LINKS);
    const request = holdRequest(connection);
    const rendering = ComingSoonPage({ params: makeParams("es") });

    await settle();
    expect(readComingSoon).not.toHaveBeenCalled();
    expect(readStore).not.toHaveBeenCalled();

    request.arrive();
    await rendering;
    expect(readComingSoon).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    // It waits on purpose, before anything is sent.
    expect(instant).toBe(false);
  });

  test("stands on its own when the database cannot be read: the dictionary's page, the brand's links, and a report of each read", async () => {
    const outage = new Error("connection refused");
    const { headline, social } = await setup({
      locale: "es",
      saved: outage,
      store: outage,
    });

    expect(headline).toBe("Muypronto");
    expect(social).toEqual([
      "https://www.instagram.com/lrmarket",
      "https://www.tiktok.com/@lrmarket",
    ]);
    expect(captureExceptionWithScope.mock.calls).toEqual([
      [outage, { action: "ComingSoon.read_page" }],
      [outage, { action: "ComingSoon.read_store" }],
    ]);
  });

  test("answers 404 for a language the product does not have", async () => {
    await expect(ComingSoonPage({ params: makeParams("fr") })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(readComingSoon).not.toHaveBeenCalled();
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
