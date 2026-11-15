import { screen, within } from "@testing-library/react";
import type * as Navigation from "next/navigation";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { PublicStore } from "@/server/services/store";
import { renderWithI18n } from "@/test/i18n";

import StoreLayout, {
  generateMetadata,
  generateStaticParams,
  generateViewport,
} from "./layout";

const { getStoreForPath } = vi.hoisted(() => ({
  getStoreForPath: vi.fn<(segment: string) => Promise<PublicStore | null>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The cached read has its own tests; here it answers by the segment it got.
vi.mock("@/server/cache/store", () => ({ getStoreForPath }));

// The language link reads the address; `notFound` stays the real one.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof Navigation>()),
  usePathname: () => "/sample-store",
  useSearchParams: () => new URLSearchParams(),
}));

const SPANISH = {
  description: "Anillos y cadenas hechos a mano.",
  locale: "es",
  tagline: "Joyas en la feria",
} as const;
const ENGLISH = {
  description: "Handmade rings and chains.",
  locale: "en",
  tagline: "Jewelry at the fair",
} as const;

function makeStore(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    colorAccent: "#ff8a3d",
    colorBackground: "#fff4e6",
    colorContrast: "#3d1f47",
    colorForeground: "#2b1a12",
    colorSurface: "#fffaf5",
    currencyCode: "USD",
    id: 7,
    instagramUrl: null,
    logoUrl: null,
    name: "Sample Store",
    slug: "sample-store",
    tiktokUrl: null,
    translations: [SPANISH, ENGLISH],
    whatsappNumber: null,
    ...overrides,
  };
}

/** The store's read answers `store` for its own slug, and nothing else. */
function answerWith(store: PublicStore) {
  getStoreForPath.mockImplementation(
    async (asked) => await Promise.resolve(asked === store.slug ? store : null)
  );
}

async function makeParams(locale: string, store = "sample-store") {
  return await Promise.resolve({ locale, store });
}

async function setup({
  locale = "es",
  segment = "sample-store",
  store = makeStore(),
}: { locale?: Locale; segment?: string; store?: PublicStore } = {}) {
  answerWith(store);

  renderWithI18n(
    await StoreLayout({
      children: <p>Page content</p>,
      params: makeParams(locale, segment),
    }),
    { locale }
  );

  return {
    footer: screen.getByTestId("store-footer"),
    header: screen.getByTestId("store-header"),
    theme: screen.getByTestId("store-theme"),
  };
}

describe("StoreLayout", () => {
  test("hands the store's five colors to the theme, each to its own token", async () => {
    const { theme } = await setup();

    expect({
      accent: theme.style.getPropertyValue("--store-accent"),
      background: theme.style.getPropertyValue("--store-background"),
      contrast: theme.style.getPropertyValue("--store-contrast"),
      foreground: theme.style.getPropertyValue("--store-foreground"),
      surface: theme.style.getPropertyValue("--store-surface"),
    }).toEqual({
      accent: "#ff8a3d",
      background: "#fff4e6",
      contrast: "#3d1f47",
      foreground: "#2b1a12",
      surface: "#fffaf5",
    });
  });

  test("another store gets its own colors", async () => {
    const { theme } = await setup({
      segment: "other-store",
      store: makeStore({ colorAccent: "#c8f31d", slug: "other-store" }),
    });

    expect(theme.style.getPropertyValue("--store-accent")).toBe("#c8f31d");
  });

  test("puts the page between the store's header and footer, in a main target the skip link reaches", async () => {
    const { footer, header, theme } = await setup();

    const main = screen.getByText("Page content").parentElement;
    expect(main).toHaveAttribute("id", "store-main");
    expect(main).toHaveAttribute("tabindex", "-1");
    // Lands below the sticky header when the skip link scrolls to it.
    expect(main).toHaveClass("scroll-mt-16");
    expect(theme).toHaveAttribute("data-slot", "store-theme");
    expect([...theme.children]).toEqual([header, main, footer]);
    expect(
      within(header).getByRole("link", { name: "Saltar al contenido" })
    ).toHaveAttribute("href", "#store-main");
  });

  test("names the store in its header and links its home in the page's language", async () => {
    const { header } = await setup({ locale: "en" });

    expect(within(header).getByTestId("store-header-home")).toHaveAttribute(
      "href",
      "/en/sample-store"
    );
    expect(within(header).getByTestId("store-header-home")).toHaveTextContent(
      /^Sample Store$/u
    );
  });

  test("gives the footer the store's links", async () => {
    const { footer } = await setup({
      store: makeStore({ whatsappNumber: "+598 99 123 456" }),
    });

    expect(
      within(footer).getByRole("link", {
        name: "Escribinos por WhatsApp (se abre en otra pestaña)",
      })
    ).toHaveAttribute("href", "https://wa.me/59899123456");
  });

  test.each([
    ["es", [SPANISH, ENGLISH], "Joyas en la feria", "es"],
    ["en", [SPANISH, ENGLISH], "Jewelry at the fair", "en"],
    // Only written in Spanish: shown in Spanish, marked as such.
    ["en", [SPANISH], "Joyas en la feria", "es"],
  ] as const)(
    "on a %s page, the footer's tagline is the store's in that language when it has one",
    async (locale, translations, tagline, lang) => {
      const { footer } = await setup({
        locale,
        store: makeStore({ translations: [...translations] }),
      });

      expect(within(footer).getByText(tagline)).toHaveAttribute("lang", lang);
    }
  );

  test("leaves the tagline out for a store with no texts", async () => {
    const { footer } = await setup({ store: makeStore({ translations: [] }) });

    expect(footer.querySelector("[lang]")).toBeNull();
    expect(screen.queryByText("Joyas en la feria")).toBeNull();
  });

  test("answers 404 for an address that is not an active store", async () => {
    getStoreForPath.mockResolvedValue(null);

    await expect(
      StoreLayout({
        children: <p>Page content</p>,
        params: makeParams("es", "nobody"),
      })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(getStoreForPath).toHaveBeenCalledExactlyOnceWith("nobody");
  });
});

describe("generateMetadata", () => {
  test.each([
    ["es", "Joyas en la feria"],
    ["en", "Jewelry at the fair"],
  ] as const)(
    "in %s, titles pages after the store and describes them with its tagline",
    async (locale, tagline) => {
      answerWith(makeStore());

      await expect(
        generateMetadata({ params: makeParams(locale) })
      ).resolves.toEqual({
        description: tagline,
        openGraph: {
          description: tagline,
          siteName: "Sample Store",
          type: "website",
        },
        title: { default: "Sample Store", template: "%s · Sample Store" },
      });
    }
  );

  test("leaves the description out for a store with no texts", async () => {
    answerWith(makeStore({ translations: [] }));

    await expect(
      generateMetadata({ params: makeParams("es") })
    ).resolves.toEqual({
      description: undefined,
      openGraph: {
        description: undefined,
        siteName: "Sample Store",
        type: "website",
      },
      title: { default: "Sample Store", template: "%s · Sample Store" },
    });
  });

  test("adds nothing for an address that is not a store", async () => {
    answerWith(makeStore());

    await expect(
      generateMetadata({ params: makeParams("es", "nobody") })
    ).resolves.toEqual({});
    expect(getStoreForPath).toHaveBeenCalledExactlyOnceWith("nobody");
  });
});

describe("generateViewport", () => {
  test.each(["#fff4e6", "#101010"])(
    "colors the browser's bar with the store's background %s",
    async (colorBackground) => {
      answerWith(makeStore({ colorBackground }));

      await expect(
        generateViewport({ params: makeParams("es") })
      ).resolves.toEqual({ themeColor: colorBackground });
    }
  );

  test("sets nothing for an address that is not a store", async () => {
    answerWith(makeStore());

    await expect(
      generateViewport({ params: makeParams("es", "nobody") })
    ).resolves.toEqual({});
  });
});

describe("generateStaticParams", () => {
  test("returns one sample segment that can never be a store's address", () => {
    expect(generateStaticParams()).toEqual([{ store: "__sample__" }]);
  });
});
