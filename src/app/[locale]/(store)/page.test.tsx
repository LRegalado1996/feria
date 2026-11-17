import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { PublicStore } from "@/server/services/store";
import { holdRequest, settle } from "@/test/connection";

import StoreHome, { generateMetadata } from "./page";

const { connection, readStore } = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({ connection }));

// The cached read has its own tests; here it answers what the test says.
vi.mock("@/server/cache/store", () => ({ readStore }));

// The footer has its own tests; here it only shows whose it is.
vi.mock("./store-page-footer", () => ({
  StorePageFooter: ({
    locale,
    store,
  }: {
    locale: Locale;
    store: PublicStore;
  }) => <footer data-testid="footer">{`${store.name} ${locale}`}</footer>,
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
    currencyCode: "USD",
    id: 7,
    instagramUrl: null,
    name: "Sample Store",
    tiktokUrl: null,
    translations: [SPANISH, ENGLISH],
    whatsappNumber: null,
    ...overrides,
  };
}

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

async function setup({
  locale = "es",
  store = makeStore(),
}: { locale?: Locale; store?: PublicStore | null } = {}) {
  readStore.mockResolvedValue(store);

  render(await StoreHome({ params: makeParams(locale) }));

  return { page: screen.getByTestId("store-home") };
}

describe("StoreHome", () => {
  test("introduces the store by name in the page's h1, inside its main landmark, then its footer", async () => {
    const { page } = await setup();

    expect(page.tagName).toBe("MAIN");
    expect(page).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Sample Store$/u
    );
    expect(screen.getByTestId("footer")).toHaveTextContent("Sample Store es");
    expect(page.compareDocumentPosition(screen.getByTestId("footer"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
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

    expect(page).toHaveTextContent(/^Sample Store$/u);
  });

  // Behind no boundary: what the page returns is the home itself, so a
  // crawler that runs no script gets it in the first response.
  test("waits for a request before reading the store, then answers the whole home, so the build needs no database", async () => {
    readStore.mockResolvedValue(makeStore());
    const request = holdRequest(connection);

    const page = StoreHome({ params: makeParams("es") });
    await settle();

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).not.toHaveBeenCalled();

    request.arrive();
    render(await page);

    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByTestId("store-home")).toContainElement(
      screen.getByRole("heading", { level: 1, name: "Sample Store" })
    );
    expect(screen.getByTestId("footer")).toHaveTextContent("Sample Store es");
  });

  test("answers 404 for a language the product does not speak, before any read", async () => {
    await expect(StoreHome({ params: makeParams("fr") })).rejects.toMatchObject(
      { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }
    );
    expect(readStore).not.toHaveBeenCalled();
  });

  test("answers the not-found page when the store's row is missing", async () => {
    readStore.mockResolvedValue(null);

    await expect(StoreHome({ params: makeParams("es") })).rejects.toMatchObject(
      { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }
    );
  });
});

describe("generateMetadata", () => {
  test.each([
    ["es", "/", SPANISH],
    ["en", "/en", ENGLISH],
  ] as const)(
    "titles the %s home after the store, with its description, its share card and both addresses",
    async (locale, canonical, text) => {
      readStore.mockResolvedValue(makeStore());

      await expect(
        generateMetadata({ params: makeParams(locale) })
      ).resolves.toEqual({
        alternates: {
          canonical,
          languages: { en: "/en", es: "/", "x-default": "/" },
        },
        description: text.description,
        openGraph: {
          description: text.tagline,
          siteName: "Sample Store",
          type: "website",
        },
        title: { absolute: "Sample Store" },
      });
    }
  );

  test("reads the store only once a request is there", async () => {
    readStore.mockResolvedValue(makeStore());
    const request = holdRequest(connection);

    const metadata = generateMetadata({ params: makeParams("es") });
    await settle();

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).not.toHaveBeenCalled();

    request.arrive();

    await expect(metadata).resolves.toMatchObject({
      title: { absolute: "Sample Store" },
    });
    expect(readStore).toHaveBeenCalledExactlyOnceWith();
  });

  test("leaves the description out for a store with no texts", async () => {
    readStore.mockResolvedValue(makeStore({ translations: [] }));

    const metadata = await generateMetadata({ params: makeParams("es") });

    expect(metadata.title).toEqual({ absolute: "Sample Store" });
    expect(metadata.description).toBeUndefined();
  });

  test("adds nothing when the store's row is missing: the 404 page titles itself", async () => {
    readStore.mockResolvedValue(null);

    await expect(
      generateMetadata({ params: makeParams("es") })
    ).resolves.toEqual({});
  });
});
