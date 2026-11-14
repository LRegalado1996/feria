import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { PublicStore } from "@/server/services/store";

import StoreHome, { ensureStatic, generateMetadata } from "./page";

const { getStoreForPath } = vi.hoisted(() => ({
  getStoreForPath: vi.fn<(segment: string) => Promise<PublicStore | null>>(),
}));

// The cached read has its own tests; here it answers by the segment it got.
vi.mock("@/server/cache/store", () => ({ getStoreForPath }));

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
    colorSurface: "#ffffff",
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

async function makeParams(locale: string, store = "sample-store") {
  return await Promise.resolve({ locale, store });
}

function answerWith(store: PublicStore | null) {
  getStoreForPath.mockImplementation(
    async (asked) =>
      await Promise.resolve(store && asked === store.slug ? store : null)
  );
}

async function setup({
  locale = "es",
  store = makeStore(),
}: { locale?: string; store?: PublicStore } = {}) {
  answerWith(store);

  render(await StoreHome({ params: makeParams(locale) }));

  return { page: screen.getByTestId("store-home") };
}

describe("StoreHome", () => {
  test("introduces the store by name in the page's h1, inside its main landmark", async () => {
    const { page } = await setup();

    expect(page.tagName).toBe("MAIN");
    expect(page).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Sample Store$/
    );
  });

  test.each([
    ["es", SPANISH],
    ["en", ENGLISH],
  ] as const)(
    "shows the store's own words in %s, the language of the URL",
    async (locale, text) => {
      await setup({ locale });

      expect(screen.getByText(text.tagline)).toHaveAttribute("lang", locale);
      expect(screen.getByTestId("store-description")).toHaveTextContent(
        text.description
      );
    }
  );

  test("an English visitor to a store written only in Spanish reads the Spanish text, marked as Spanish", async () => {
    await setup({
      locale: "en",
      store: makeStore({ translations: [SPANISH] }),
    });

    expect(screen.getByText("Joyas en la feria")).toHaveAttribute("lang", "es");
    expect(screen.getByTestId("store-description")).toHaveAttribute(
      "lang",
      "es"
    );
  });

  test("a store with no texts yet shows its name and nothing empty", async () => {
    const { page } = await setup({ store: makeStore({ translations: [] }) });

    expect(page).toHaveTextContent(/^Sample Store$/);
  });

  test("answers 404 for an address that is not an active store", async () => {
    answerWith(null);

    await expect(
      StoreHome({ params: makeParams("es", "nobody") })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(getStoreForPath).toHaveBeenCalledExactlyOnceWith("nobody");
  });

  test("answers 404 for a language the product does not speak, before any lookup", async () => {
    answerWith(makeStore());

    await expect(StoreHome({ params: makeParams("fr") })).rejects.toMatchObject(
      { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }
    );
    expect(getStoreForPath).not.toHaveBeenCalled();
  });

  test("is complete static output, so the lookup runs before the status is sent", () => {
    expect(ensureStatic).toBe("navigation");
  });
});

describe("generateMetadata", () => {
  test.each([
    ["es", "/sample-store", SPANISH.description],
    ["en", "/en/sample-store", ENGLISH.description],
  ] as const)(
    "titles the %s page after the store, with its description and both addresses",
    async (locale, canonical, description) => {
      answerWith(makeStore());

      await expect(
        generateMetadata({ params: makeParams(locale) })
      ).resolves.toEqual({
        alternates: {
          canonical,
          languages: {
            en: "/en/sample-store",
            es: "/sample-store",
            "x-default": "/sample-store",
          },
        },
        description,
        title: "Sample Store",
      });
    }
  );

  test("leaves the description out for a store with no texts", async () => {
    answerWith(makeStore({ translations: [] }));

    const metadata = await generateMetadata({ params: makeParams("es") });

    expect(metadata.title).toBe("Sample Store");
    expect(metadata.description).toBeUndefined();
  });

  test("adds nothing for an address that is not a store: the 404 page titles itself", async () => {
    answerWith(null);

    await expect(
      generateMetadata({ params: makeParams("es", "nobody") })
    ).resolves.toEqual({});
  });
});
