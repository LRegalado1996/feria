import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { StorePageArticle } from "@/app/_components/molecules/store-page-sections";
import type { Locale } from "@/lib/i18n/config";
import type { PageContent } from "@/lib/page/content";
import type { PublicStore } from "@/server/services/store";
import { holdRequest, settle } from "@/test/connection";
import { DICTIONARIES } from "@/test/i18n";

import StoreHomePage, { generateMetadata, instant } from "./page";
import { StorePageFooter } from "./store-page-footer";

const {
  connection,
  frameProps,
  homeProps,
  readHomePage,
  readHomePageId,
  readPageContent,
  readStore,
  shellOf,
} = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  frameProps: vi.fn<(props: Record<string, unknown>) => void>(),
  homeProps: vi.fn<(props: Record<string, unknown>) => void>(),
  // The home page's own texts for search engines; none by default.
  readHomePage: vi.fn<
    (
      store: unknown,
      locale: string
    ) => Promise<{
      seoDescription: string | null;
      seoTitle: string | null;
    } | null>
  >(async () => ({ seoDescription: null, seoTitle: null })),
  // The store's home is its page 12 (FER-058), not its id (7).
  readHomePageId: vi.fn(async (_store: unknown) => 12),
  readPageContent:
    vi.fn<
      (
        store: unknown,
        pageId: number,
        locale: string
      ) => Promise<PageContent<StorePageArticle & { categorySlug: string }>>
    >(),
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
vi.mock("@/server/cache/page", () => ({
  readHomePage,
  readHomePageId,
  readPageContent,
}));

// The home has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/store-home", () => ({
  StoreHome: (props: Record<string, unknown>) => {
    homeProps(props);
    return <div data-testid="home-view" />;
  },
}));

vi.mock("@/lib/seo/origin", () => ({
  absoluteUrl: (path: string) => `http://localhost:3000${path}`,
}));

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
  location: null,
  tagline: "Joyas en la feria",
} as const;
const ENGLISH = {
  description: "Handmade rings and chains.",
  locale: "en",
  location: null,
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

function makeCard(slug: string, title: string) {
  return {
    categorySlug: "burbujeros",
    cover: null,
    currencyCode: "UYU" as const,
    id: slug.length,
    isAvailable: true,
    lang: "es",
    priceAmount: 79_000,
    slug,
    title,
  };
}

const CONTENT: PageContent<ReturnType<typeof makeCard>> = {
  cover: [],
  sections: [
    {
      articles: [makeCard("burbujero-pez", "Burbujero pez")],
      key: "best_sellers",
      kind: "best_sellers",
    },
    {
      banner: {
        ctaLabel: null,
        href: null,
        id: 9,
        image: { height: 800, url: "/seed/bubbles-1.jpg", width: 1200 },
        lang: "es",
        phoneImage: null,
        title: "En la feria",
      },
      key: "banner:9",
      kind: "banner",
    },
    {
      articles: [makeCard("aro", "Aro"), makeCard("aro-perla", "Aro perla")],
      category: { id: 4, lang: "es", name: "Aros", path: "/aros" },
      key: "category:4",
      kind: "category",
    },
    {
      articles: [makeCard("anillo", "Anillo")],
      key: "featured",
      kind: "featured",
    },
  ],
};

async function setup({
  content = CONTENT,
  locale = "es",
  store = makeStore(),
}: {
  content?: typeof CONTENT;
  locale?: Locale;
  store?: PublicStore | null;
} = {}) {
  readStore.mockResolvedValue(store);
  readPageContent.mockResolvedValue(content);

  const page = await StoreHomePage({ params: makeParams(locale) });
  render(page);

  return { home: screen.getByTestId("store-home"), page };
}

/** The page's JSON-LD, as a search engine reads it. */
function structuredData(): unknown {
  const script = document.querySelector('script[type="application/ld+json"]');

  return JSON.parse(script?.textContent ?? "null");
}

describe("StoreHomePage", () => {
  test.each(["es", "en"] as const)(
    "in %s, hands the home what it shows now, read from the cache for the store, with the store's own words",
    async (locale) => {
      const { home } = await setup({ locale });

      expect(home.tagName).toBe("MAIN");
      // The page the store chose as its home, in the visitor's language.
      expect(readHomePageId).toHaveBeenCalledExactlyOnceWith(makeStore());
      expect(readPageContent).toHaveBeenCalledExactlyOnceWith(
        makeStore(),
        12,
        locale
      );
      expect(homeProps).toHaveBeenCalledExactlyOnceWith({
        browse: {
          href: locale === "es" ? "/productos" : "/en/productos",
          label: DICTIONARIES[locale].storefront.home.browse,
        },
        content: CONTENT,
        copy: DICTIONARIES[locale].storefront,
        locale,
        name: "Sample Store",
        text: locale === "es" ? SPANISH : ENGLISH,
      });
      expect(home).toContainElement(screen.getByTestId("home-view"));
    }
  );

  test("an English visitor to a store written only in Spanish gets the Spanish words", async () => {
    await setup({
      locale: "en",
      store: makeStore({ translations: [SPANISH] }),
    });

    expect(homeProps).toHaveBeenCalledWith(
      expect.objectContaining({ text: SPANISH })
    );
  });

  test("puts the home in its main landmark, then the store's footer", async () => {
    const { home } = await setup();

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
    [
      "es",
      "http://localhost:3000/",
      "Más vendidos",
      "/productos/burbujero-pez",
    ],
    [
      "en",
      "http://localhost:3000/en",
      "Best sellers",
      "/en/productos/burbujero-pez",
    ],
  ] as const)(
    "in %s, tells search engines about the site, the store and each row's articles in their order",
    async (locale, home, bestSellers, article) => {
      await setup({
        locale,
        store: makeStore({ instagramUrl: "https://instagram.com/sample" }),
      });

      expect(structuredData()).toEqual([
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          inLanguage: locale,
          name: "Sample Store",
          url: home,
        },
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          logo: "http://localhost:3000/brand/lr-market-logo.svg",
          name: "Sample Store",
          sameAs: ["https://instagram.com/sample"],
          url: home,
        },
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: [
            {
              "@type": "ListItem",
              name: "Burbujero pez",
              position: 1,
              url: `http://localhost:3000${article}`,
            },
          ],
          name: bestSellers,
          numberOfItems: 1,
        },
        expect.objectContaining({
          "@type": "ItemList",
          name: "Aros",
          numberOfItems: 2,
        }),
        expect.objectContaining({
          "@type": "ItemList",
          name: DICTIONARIES[locale].storefront.home.featured,
          numberOfItems: 1,
        }),
      ]);
    }
  );

  test("an article in the spotlight is a list of one, named by the article as its heading is", async () => {
    await setup({
      content: {
        cover: [],
        sections: [
          {
            key: "spotlight:51",
            kind: "spotlight",
            spotlight: {
              article: makeCard("burbujero-pez", "Burbujero pez"),
              id: 51,
              label: null,
              phrase: null,
            },
          },
        ],
      },
      locale: "en",
    });

    expect(structuredData()).toEqual([
      expect.objectContaining({ "@type": "WebSite" }),
      expect.objectContaining({ "@type": "Organization" }),
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: [
          {
            "@type": "ListItem",
            name: "Burbujero pez",
            position: 1,
            url: "http://localhost:3000/en/productos/burbujero-pez",
          },
        ],
        name: "Burbujero pez",
        numberOfItems: 1,
      },
    ]);
  });

  test('"how to buy" holds no article: it adds no list to the structured data (FER-076)', async () => {
    await setup({
      content: {
        cover: [],
        sections: [
          { key: "how_to_buy", kind: "how_to_buy" },
          {
            articles: [makeCard("anillo", "Anillo")],
            key: "featured",
            kind: "featured",
          },
        ],
      },
    });

    expect(structuredData()).toEqual([
      expect.objectContaining({ "@type": "WebSite" }),
      expect.objectContaining({ "@type": "Organization" }),
      expect.objectContaining({
        "@type": "ItemList",
        name: "Destacados",
        numberOfItems: 1,
      }),
    ]);
  });

  test("a home with nothing to show tells search engines only about the site and the store", async () => {
    await setup({ content: { cover: [], sections: [] } });

    expect(structuredData()).toEqual([
      expect.objectContaining({ "@type": "WebSite" }),
      expect.objectContaining({ "@type": "Organization" }),
    ]);
  });

  test("waits for a request before reading the store, so the build needs no database", async () => {
    readStore.mockResolvedValue(makeStore());
    readPageContent.mockResolvedValue(CONTENT);
    const request = holdRequest(connection);

    const page = StoreHomePage({ params: makeParams("es") });
    await settle();

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).not.toHaveBeenCalled();
    expect(readHomePageId).not.toHaveBeenCalled();
    expect(readPageContent).not.toHaveBeenCalled();

    request.arrive();
    render(await page);

    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByTestId("home-view")).toBeInTheDocument();
  });

  test("answers the not-found page, in no frame of its own, when the store's row is missing", async () => {
    readStore.mockResolvedValue(null);

    await expect(
      StoreHomePage({ params: makeParams("es") })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(shellOf).not.toHaveBeenCalled();
    expect(readHomePageId).not.toHaveBeenCalled();
    expect(readPageContent).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any read", async () => {
    await expect(
      StoreHomePage({ params: makeParams("fr") })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
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

  test("takes the home page's own title and description for search engines when it has them (FER-060)", async () => {
    readStore.mockResolvedValue(makeStore());
    readHomePage.mockResolvedValueOnce({
      seoDescription: "Regalos para todos.",
      seoTitle: "Regalos de Navidad",
    });

    const metadata = await generateMetadata({ params: makeParams("en") });

    expect(metadata.title).toEqual({ absolute: "Regalos de Navidad" });
    expect(metadata.description).toBe("Regalos para todos.");
    expect(metadata.openGraph).toEqual({
      description: "Regalos para todos.",
      siteName: "Sample Store",
      type: "website",
    });
    // Still at `/`, whichever page the home is.
    expect(metadata.alternates?.canonical).toBe("/en");
    expect(readHomePage).toHaveBeenCalledExactlyOnceWith(makeStore(), "en");
  });

  test("adds nothing when the store's row is missing: the 404 page titles itself", async () => {
    readStore.mockResolvedValue(null);

    await expect(
      generateMetadata({ params: makeParams("es") })
    ).resolves.toEqual({});
  });
});
