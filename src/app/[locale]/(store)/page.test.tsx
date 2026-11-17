import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { PublicStore } from "@/server/services/store";
import { holdRequest, settle } from "@/test/connection";
import { DICTIONARIES } from "@/test/i18n";

import StoreHome, { generateMetadata, instant } from "./page";
import { StorePageFooter } from "./store-page-footer";

const { connection, frameProps, readStore, shellOf } = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  frameProps: vi.fn<(props: Record<string, unknown>) => void>(),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
  shellOf: vi.fn((store: { name: string }, locale: string) => ({
    shellOf: `${store.name} ${locale}`,
  })),
}));

// The frame's parts have their own tests (`store-shell.test.ts`).
vi.mock("./store-shell", () => ({ shellOf }));

// The frame has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/store-frame", () => ({
  StoreFrame: ({
    children,
    ...props
  }: Record<string, unknown> & { children: ReactNode }) => {
    frameProps(props);
    return <div data-testid="store-frame">{children}</div>;
  },
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

  const page = await StoreHome({ params: makeParams(locale) });
  render(page);

  return { home: screen.getByTestId("store-home"), page };
}

describe("StoreHome", () => {
  test.each([
    ["es", "Ver el catálogo", "/productos"],
    ["en", "See the catalog", "/en/productos"],
  ] as const)(
    "in %s, leads into the catalog from the intro with %j",
    async (locale, label, href) => {
      await setup({ locale });

      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href
      );
    }
  );

  test("introduces the store by name in the page's h1, inside its main landmark, then its footer", async () => {
    const { home } = await setup();

    expect(home.tagName).toBe("MAIN");
    expect(home).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Sample Store$/u
    );
    expect(screen.getByTestId("footer")).toHaveTextContent("Sample Store es");
    expect(home.compareDocumentPosition(screen.getByTestId("footer"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  test.each(["es", "en"] as const)(
    "in %s, sits in the store's frame, made from the store it read, in the page's language",
    async (locale) => {
      await setup({ locale });

      expect(screen.getByTestId("store-frame")).toContainElement(
        screen.getByTestId("store-home")
      );
      expect(frameProps).toHaveBeenCalledExactlyOnceWith({
        copy: DICTIONARIES[locale].storefront.shell,
        locale,
        shellOf: `Sample Store ${locale}`,
      });
    }
  );

  test("puts the home and its footer in the page itself, behind no boundary, so a crawler that runs no script reads them in the HTML", async () => {
    const { page } = await setup();
    const { children } = (page as ReactElement<{ children: ReactElement[] }>)
      .props;

    // Behind a boundary of its own, either would reach such a crawler as the
    // boundary's fallback (docs/agents/nextjs.md § Store pages).
    expect(children.map((part) => part.type)).toEqual([
      "main",
      StorePageFooter,
    ]);
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

  test("a store with no texts yet shows its name, the way into the catalog, and nothing empty", async () => {
    const { home } = await setup({ store: makeStore({ translations: [] }) });

    expect(home).toHaveTextContent(/^Sample StoreVer el catálogo$/u);
  });

  test("waits for a request before reading the store, so the build needs no database", async () => {
    readStore.mockResolvedValue(makeStore());
    const request = holdRequest(connection);

    const page = StoreHome({ params: makeParams("es") });
    await settle();

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).not.toHaveBeenCalled();

    request.arrive();
    render(await page);

    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Sample Store$/u
    );
  });

  test("answers the not-found page, in no frame of its own, when the store's row is missing", async () => {
    readStore.mockResolvedValue(null);

    await expect(StoreHome({ params: makeParams("es") })).rejects.toMatchObject(
      { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }
    );
    expect(shellOf).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any read", async () => {
    await expect(StoreHome({ params: makeParams("fr") })).rejects.toMatchObject(
      { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }
    );
    expect(connection).not.toHaveBeenCalled();
    expect(readStore).not.toHaveBeenCalled();
  });

  test("opts out of the instant-navigation check: it waits for the store by design", () => {
    expect(instant).toBe(false);
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
