import { screen, within } from "@testing-library/react";
import type { ResolvedMetadata } from "next";
import { describe, expect, type Mock, test, vi } from "vitest";

import type {
  StoredComingSoon,
  StoreSocialLinks,
} from "@/lib/coming-soon/content";
import type { Locale } from "@/lib/i18n/config";
import { SWITCH_TIMEOUT_MS } from "@/server/cache/storefront-switch";
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

/** What a read answers: its value, a rejection, or nothing ever ("stall"). */
function answerWith<T>(
  read: Mock<() => Promise<T>>,
  answer: Awaited<T> | Error | "stall"
) {
  if (answer === "stall") {
    read.mockReturnValue(new Promise<never>(() => {}));
  } else if (answer instanceof Error) {
    read.mockRejectedValue(answer);
  } else {
    read.mockResolvedValue(answer);
  }
}

/**
 * The page in `locale`, already asked for, its reads answering `saved` and
 * `store`. `held`: the request has not arrived until `arrive()`. `fakeClock`:
 * the test moves time. `show()` renders what it answered and reads the
 * headline and the social links off it.
 */
function setup({
  fakeClock = false,
  held = false,
  locale = "en",
  saved = SAVED,
  store = STORE_LINKS,
}: {
  fakeClock?: boolean;
  held?: boolean;
  locale?: Locale;
  saved?: StoredComingSoon | Error | "stall";
  store?: StoreSocialLinks | Error | "stall";
} = {}) {
  if (fakeClock) {
    vi.useFakeTimers();
  }
  stubIntersectionObserver();
  stubReducedMotion(false);
  answerWith(readComingSoon, saved);
  answerWith(readStore, store);
  const request = held ? holdRequest(connection) : { arrive: () => undefined };
  const rendering = ComingSoonPage({ params: makeParams(locale) });

  return {
    arrive: request.arrive,
    rendering,
    show: async () => {
      renderWithI18n(await rendering, { locale });
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
    },
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
      const { show } = setup({ locale });
      const { headline: shown, page } = await show();

      expect(page).toHaveAttribute("data-slot", "store-coming-soon");
      expect(shown).toBe(headline);
      expect(readComingSoon).toHaveBeenCalledExactlyOnceWith();
    }
  );

  test("links the store's own social profiles, the brand's where the store has none", async () => {
    const { show } = setup({ locale: "es" });
    const { social } = await show();

    expect(social).toEqual([
      "https://instagram.com/e2e-market",
      "https://www.tiktok.com/@lrmarket",
    ]);
    expect(readStore).toHaveBeenCalledExactlyOnceWith();
  });

  test("links the brand's profiles when the store cannot be read, and reports it", async () => {
    const outage = new Error("connection refused");
    const { show } = setup({ locale: "es", store: outage });
    const { headline, social } = await show();

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
    const { arrive, rendering } = setup({ held: true, locale: "es" });

    await settle();
    expect(readComingSoon).not.toHaveBeenCalled();
    expect(readStore).not.toHaveBeenCalled();

    arrive();
    await rendering;
    expect(readComingSoon).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    // It waits on purpose, before anything is sent.
    expect(instant).toBe(false);
  });

  test("stands on its own when the database cannot be read: the dictionary's page, the brand's links, and a report of each read", async () => {
    const outage = new Error("connection refused");
    const { show } = setup({ locale: "es", saved: outage, store: outage });
    const { headline, social } = await show();

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

  test("falls back when the database stalls: each read gets the switch's time limit, then the dictionary's page and the brand's links, and a report of each", async () => {
    const { rendering, show } = setup({
      fakeClock: true,
      locale: "es",
      saved: "stall",
      store: "stall",
    });
    const settled = vi.fn();
    void rendering.then(settled);

    await vi.advanceTimersByTimeAsync(SWITCH_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    expect(captureExceptionWithScope).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledExactlyOnceWith(await rendering);
    expect(captureExceptionWithScope.mock.calls).toEqual([
      [
        new Error(
          `The coming-soon page's read took over ${SWITCH_TIMEOUT_MS} ms`
        ),
        { action: "ComingSoon.read_page" },
      ],
      [
        new Error(
          `The coming-soon page's store read took over ${SWITCH_TIMEOUT_MS} ms`
        ),
        { action: "ComingSoon.read_store" },
      ],
    ]);

    vi.useRealTimers();
    const { headline, social } = await show();
    expect(headline).toBe("Muypronto");
    expect(social).toEqual([
      "https://www.instagram.com/lrmarket",
      "https://www.tiktok.com/@lrmarket",
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
