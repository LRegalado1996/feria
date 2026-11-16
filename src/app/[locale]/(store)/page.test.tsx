import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { getDictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import type { PublicStore } from "@/server/services/store";
import { holdRequest, settle } from "@/test/connection";

import StoreHome, { generateMetadata, StoreHomeContent } from "./page";

const { connection, readStore, SHELL, streamedShell } = vi.hoisted(() => {
  const shell = {
    announcement: Promise.resolve(null),
    categories: Promise.resolve([]),
  };

  return {
    connection: vi.fn(async () => undefined),
    readStore: vi.fn<() => Promise<PublicStore | null>>(),
    SHELL: shell,
    streamedShell: vi.fn(() => shell),
  };
});

// The frame's streamed parts have their own tests (`store-shell.test.ts`).
vi.mock("./store-shell", () => ({ streamedShell }));

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

  render(await StoreHomeContent({ locale }));

  return { page: screen.getByTestId("store-home") };
}

describe("StoreHome", () => {
  test.each([
    ["es", "Cargando"],
    ["en", "Loading"],
  ] as const)(
    "in %s, streams the home behind an empty, busy main, reading nothing yet",
    async (locale, loading) => {
      const page = (await StoreHome({
        params: makeParams(locale),
      })) as ReactElement<{
        children: ReactElement<{
          children: ReactElement<{ locale: Locale }>;
          fallback: ReactNode;
        }>;
      }>;
      const boundary = page.props.children;

      render(boundary.props.fallback);

      expect(screen.getByTestId("store-home-skeleton")).toHaveAttribute(
        "aria-busy",
        "true"
      );
      expect(screen.getByRole("status")).toHaveTextContent(loading);
      expect(boundary.props.children.props).toEqual({ locale });
      expect(readStore).not.toHaveBeenCalled();
    }
  );

  test.each(["es", "en"] as const)(
    "in %s, sits in the store's frame, with the shell's words and what streams of the store",
    async (locale) => {
      const page = (await StoreHome({
        params: makeParams(locale),
      })) as ReactElement<Record<string, unknown>>;

      expect(page.type).toBe(StoreFrame);
      expect(page.props).toMatchObject({
        announcement: SHELL.announcement,
        categories: SHELL.categories,
        copy: getDictionary(locale).storefront.shell,
        locale,
      });
      expect(streamedShell).toHaveBeenLastCalledWith(locale);
    }
  );

  test("answers 404 for a language the product does not speak, before any read", async () => {
    await expect(StoreHome({ params: makeParams("fr") })).rejects.toMatchObject(
      { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }
    );
    expect(readStore).not.toHaveBeenCalled();
  });
});

describe("StoreHomeContent", () => {
  test.each([
    ["es", "Ver el catálogo", "/products"],
    ["en", "See the catalog", "/en/products"],
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

  test("a store with no texts yet shows its name, the way into the catalog, and nothing empty", async () => {
    const { page } = await setup({ store: makeStore({ translations: [] }) });

    expect(page).toHaveTextContent(/^Sample StoreVer el catálogo$/u);
  });

  test("waits for a request before reading the store, so the build needs no database", async () => {
    readStore.mockResolvedValue(makeStore());
    const request = holdRequest(connection);

    const content = StoreHomeContent({ locale: "es" });
    await settle();

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).not.toHaveBeenCalled();

    request.arrive();
    render(await content);

    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Sample Store$/u
    );
  });

  test("answers the not-found page when the store's row is missing", async () => {
    readStore.mockResolvedValue(null);

    await expect(StoreHomeContent({ locale: "es" })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
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
