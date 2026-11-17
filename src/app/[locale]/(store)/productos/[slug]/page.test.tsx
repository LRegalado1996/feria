import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { StoreArticleProps } from "@/app/_components/organisms/store-article";
import type { Locale } from "@/lib/i18n/config";
import type { ProductCard, PublishedProduct } from "@/server/services/catalog";
import type { PublicStore } from "@/server/services/store";
import { DICTIONARIES } from "@/test/i18n";

import ArticlePage, {
  ensureStatic,
  generateMetadata,
  generateStaticParams,
  instant,
} from "./page";

const {
  articleProps,
  frameProps,
  readPublishedArticle,
  readRelated,
  readStore,
  shellOf,
} = vi.hoisted(() => ({
  articleProps: vi.fn<(props: StoreArticleProps) => void>(),
  frameProps: vi.fn<(props: Record<string, unknown>) => void>(),
  shellOf: vi.fn((store: { name: string }, locale: string) => ({
    shellOf: `${store.name} ${locale}`,
  })),
  readPublishedArticle:
    vi.fn<
      (
        store: PublicStore,
        slug: string,
        locale: Locale
      ) => Promise<PublishedProduct | null>
    >(),
  readRelated:
    vi.fn<
      (
        store: PublicStore,
        article: PublishedProduct,
        locale: Locale
      ) => Promise<ProductCard[]>
    >(),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The cached reads have their own tests; here they answer by what they got.
vi.mock("@/server/cache/store", () => ({ readStore }));
vi.mock("@/server/cache/catalog", () => ({
  readPublishedArticle,
  readRelatedArticles: readRelated,
}));

// The article organism has its own tests; here it records what it was given.
vi.mock("@/app/_components/organisms/store-article", () => ({
  StoreArticle: (props: StoreArticleProps) => {
    articleProps(props);
    return <div data-testid="store-article">{props.article.title}</div>;
  },
}));

// The frame's parts have their own tests (`store-shell.test.ts`).
vi.mock("../../store-shell", () => ({ shellOf }));

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

// The footer has its own tests; here it only shows whose it is.
vi.mock("../../store-page-footer", () => ({
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

const ORIGIN = "http://localhost:3000";
const LOGO = `${ORIGIN}/brand/lr-market-logo.svg`;
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

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

function makeArticle(
  overrides: Partial<PublishedProduct> = {}
): PublishedProduct {
  return {
    category: null,
    categoryId: null,
    currencyCode: "USD",
    description: "Plata 925, hecho a mano.",
    id: 41,
    images: [
      {
        alt: "El anillo de frente",
        height: 800,
        id: 3,
        url: "/uploads/anillo.jpg",
        width: 800,
      },
    ],
    isAvailable: true,
    lang: "es",
    priceAmount: 125_050,
    publishedAt: new Date("2026-11-01T12:00:00.000Z"),
    seoDescription: null,
    seoTitle: null,
    slug: "anillo-de-plata",
    title: "Anillo de plata",
    ...overrides,
  };
}

/** The same article as read in English: its own name and description. */
function makeEnglishArticle(): PublishedProduct {
  return makeArticle({
    description: "Sterling silver, handmade.",
    lang: "en",
    title: "Silver ring",
  });
}

function makeCard(): ProductCard {
  return {
    categorySlug: null,
    cover: null,
    currencyCode: "USD",
    id: 42,
    isAvailable: true,
    lang: "es",
    priceAmount: 9900,
    slug: "cadena",
    title: "Cadena",
  };
}

async function makeParams(locale: string, slug = "anillo-de-plata") {
  return await Promise.resolve({ locale, slug });
}

/**
 * The store's reads answer `store` (`null`: its row is missing) and its
 * `article` only, in each language the article as `english` overrides it
 * there (the same article unless given).
 */
function setup({
  article = makeArticle(),
  english = article,
  locale = "es",
  related = [makeCard()],
  slug = article.slug,
  store = makeStore(),
}: {
  article?: PublishedProduct;
  english?: PublishedProduct;
  locale?: string;
  related?: ProductCard[];
  slug?: string;
  store?: PublicStore | null;
} = {}) {
  const translated: Record<Locale, PublishedProduct> = {
    en: english,
    es: article,
  };
  readStore.mockResolvedValue(store);
  readPublishedArticle.mockImplementation(
    async (asked, askedSlug, askedLocale) =>
      await Promise.resolve(
        asked === store && askedSlug === article.slug
          ? translated[askedLocale]
          : null
      )
  );
  readRelated.mockResolvedValue(related);

  return {
    article,
    metadata: async () =>
      await generateMetadata({ params: makeParams(locale, slug) }),
    related,
    resolve: async () =>
      await ArticlePage({ params: makeParams(locale, slug) }),
    show: async () => {
      render(await ArticlePage({ params: makeParams(locale, slug) }));

      const script = document.querySelector(
        'script[type="application/ld+json"]'
      );

      return {
        jsonLd: (): unknown => JSON.parse(script?.textContent ?? "null"),
        props: () => articleProps.mock.calls[0]?.[0],
      };
    },
    store,
  };
}

describe("ArticlePage", () => {
  test("is complete static output, so the read runs before the status is sent", () => {
    expect(ensureStatic).toBe("navigation");
  });

  test("says it blocks on purpose, so the development check does not flag every visit", () => {
    expect(instant).toBe(false);
  });

  test("prerenders one sample slug that no article can have", () => {
    expect(generateStaticParams()).toEqual([{ slug: "__sample__" }]);
  });

  test.each([
    ["the build's sample", "__sample__"],
    ["an address with spaces", " anillo "],
  ])(
    "answers 404 for %s before the store is read, so the build needs no database",
    async (_case, slug) => {
      const { resolve } = setup({ slug });

      await expect(resolve()).rejects.toMatchObject(NOT_FOUND);
      expect(readStore).not.toHaveBeenCalled();
      expect(readPublishedArticle).not.toHaveBeenCalled();
    }
  );

  test("answers 404 when the store's row is missing, asking for no article", async () => {
    const { resolve } = setup({ store: null });

    await expect(resolve()).rejects.toMatchObject(NOT_FOUND);
    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    expect(readPublishedArticle).not.toHaveBeenCalled();
  });

  test("answers 404 for an article the store does not publish, asking for nothing beside it", async () => {
    const { resolve, store } = setup({ slug: "borrador" });

    await expect(resolve()).rejects.toMatchObject(NOT_FOUND);
    expect(readPublishedArticle).toHaveBeenCalledExactlyOnceWith(
      store,
      "borrador",
      "es"
    );
    expect(readRelated).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any lookup", async () => {
    const { resolve } = setup({ locale: "fr" });

    await expect(resolve()).rejects.toMatchObject(NOT_FOUND);
    expect(readStore).not.toHaveBeenCalled();
  });

  test.each([
    ["es", makeArticle()],
    ["en", makeEnglishArticle()],
  ] as const)(
    "in %s, hands the organism the article read in that language, its copy and the articles beside it",
    async (locale, article) => {
      const { related, show, store } = setup({
        english: makeEnglishArticle(),
        locale,
      });

      const { props } = await show();

      expect(readPublishedArticle).toHaveBeenCalledExactlyOnceWith(
        store,
        "anillo-de-plata",
        locale
      );
      expect(readRelated).toHaveBeenCalledExactlyOnceWith(
        store,
        article,
        locale
      );
      expect(props()).toEqual({
        article,
        copy: DICTIONARIES[locale].storefront,
        locale,
        related,
        whatsappHref: null,
      });
      expect(screen.getByTestId("store-article").parentElement?.tagName).toBe(
        "MAIN"
      );
    }
  );

  test("sits in the store's frame, made from the store and the cached reads, in the page's language", async () => {
    const { show } = setup({ locale: "en" });

    await show();

    expect(screen.getByTestId("store-frame")).toContainElement(
      screen.getByTestId("store-article")
    );
    expect(frameProps).toHaveBeenCalledExactlyOnceWith({
      copy: DICTIONARIES.en.storefront.shell,
      locale: "en",
      shellOf: "Sample Store en",
    });
  });

  test("ends with the store's footer, after the article, in the page's language", async () => {
    const { show } = setup({ locale: "en" });

    await show();

    const main = screen.getByTestId("store-article").parentElement;
    expect(screen.getByTestId("footer")).toHaveTextContent(
      /^Sample Store en$/u
    );
    expect(main?.compareDocumentPosition(screen.getByTestId("footer"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  test.each([
    [
      "es",
      "¡Hola! Te escribo por «Aros & cadenas»: http://localhost:3000/productos/aros-y-cadenas",
    ],
    [
      "en",
      "Hi! I'm writing about “Aros & cadenas”: http://localhost:3000/en/productos/aros-y-cadenas",
    ],
  ] as const)(
    "in %s, opens the store's WhatsApp at its digits with the article's name and address written",
    async (locale, text) => {
      const { show } = setup({
        article: makeArticle({
          slug: "aros-y-cadenas",
          title: "Aros & cadenas",
        }),
        locale,
        store: makeStore({ whatsappNumber: "+598 99-123 456" }),
      });

      const { props } = await show();
      const href = new URL(props()?.whatsappHref ?? "");

      expect(href.origin).toBe("https://wa.me");
      expect(href.pathname).toBe("/59899123456");
      expect([...href.searchParams.entries()]).toEqual([["text", text]]);
    }
  );

  test("describes the article, its trail and the store, with the brand's logo, as structured data", async () => {
    const { show } = setup({
      article: makeArticle({
        category: {
          group: { name: "Bijouterie", path: "/bijouterie" },
          name: "Anillos",
          path: "/bijouterie/anillos",
          slug: "anillos",
        },
        categoryId: 5,
        images: [
          {
            alt: "De frente",
            height: 800,
            id: 3,
            url: "/uploads/anillo.jpg",
            width: 800,
          },
          {
            alt: "De costado",
            height: 800,
            id: 4,
            url: "https://cdn.example.test/anillo-2.jpg",
            width: 800,
          },
        ],
        isAvailable: false,
      }),
      store: makeStore({
        instagramUrl: "https://instagram.com/sample",
        tiktokUrl: "https://tiktok.com/@sample",
      }),
    });

    const { jsonLd } = await show();
    const url = `${ORIGIN}/productos/anillo-de-plata`;

    expect(jsonLd()).toEqual([
      {
        "@context": "https://schema.org",
        "@type": "Product",
        brand: { "@type": "Brand", name: "Sample Store" },
        category: "Anillos",
        description: "Plata 925, hecho a mano.",
        image: [
          `${ORIGIN}/uploads/anillo.jpg`,
          "https://cdn.example.test/anillo-2.jpg",
        ],
        name: "Anillo de plata",
        offers: {
          "@type": "Offer",
          availability: "https://schema.org/OutOfStock",
          price: "1250.50",
          priceCurrency: "USD",
          seller: { "@type": "Organization", name: "Sample Store" },
          url,
        },
        sku: "anillo-de-plata",
        url,
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            item: `${ORIGIN}/`,
            name: "Sample Store",
            position: 1,
          },
          {
            "@type": "ListItem",
            item: `${ORIGIN}/productos`,
            name: "Todos los artículos",
            position: 2,
          },
          {
            "@type": "ListItem",
            item: `${ORIGIN}/bijouterie`,
            name: "Bijouterie",
            position: 3,
          },
          {
            "@type": "ListItem",
            item: `${ORIGIN}/bijouterie/anillos`,
            name: "Anillos",
            position: 4,
          },
          {
            "@type": "ListItem",
            item: url,
            name: "Anillo de plata",
            position: 5,
          },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        logo: LOGO,
        name: "Sample Store",
        sameAs: ["https://instagram.com/sample", "https://tiktok.com/@sample"],
        url: `${ORIGIN}/`,
      },
    ]);
  });

  test("in English, trails an article with no category from the store through the catalog, in English addresses", async () => {
    const { show } = setup({ locale: "en" });

    const { jsonLd } = await show();
    const url = `${ORIGIN}/en/productos/anillo-de-plata`;

    expect(jsonLd()).toEqual([
      {
        "@context": "https://schema.org",
        "@type": "Product",
        brand: { "@type": "Brand", name: "Sample Store" },
        description: "Plata 925, hecho a mano.",
        image: [`${ORIGIN}/uploads/anillo.jpg`],
        name: "Anillo de plata",
        offers: {
          "@type": "Offer",
          availability: "https://schema.org/InStock",
          price: "1250.50",
          priceCurrency: "USD",
          seller: { "@type": "Organization", name: "Sample Store" },
          url,
        },
        sku: "anillo-de-plata",
        url,
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            item: `${ORIGIN}/en`,
            name: "Sample Store",
            position: 1,
          },
          {
            "@type": "ListItem",
            item: `${ORIGIN}/en/productos`,
            name: "All articles",
            position: 2,
          },
          {
            "@type": "ListItem",
            item: url,
            name: "Anillo de plata",
            position: 3,
          },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        logo: LOGO,
        name: "Sample Store",
        url: `${ORIGIN}/en`,
      },
    ]);
  });
});

describe("generateMetadata", () => {
  test.each([
    ["the store's row", { store: null }],
    ["the article", { slug: "borrador" }],
  ] as const)("adds nothing when %s is missing", async (_missing, options) => {
    const { metadata } = setup(options);

    await expect(metadata()).resolves.toEqual({});
  });

  test("adds nothing for the build's sample, before the store is read", async () => {
    const { metadata } = setup({ slug: "__sample__" });

    await expect(metadata()).resolves.toEqual({});
    expect(readStore).not.toHaveBeenCalled();
  });

  test.each([
    ["es", "/productos/anillo-de-plata"],
    ["en", "/en/productos/anillo-de-plata"],
  ] as const)(
    "in %s, prefers the article's own search title and description, with both addresses, after which the store's name",
    async (locale, canonical) => {
      const { metadata } = setup({
        article: makeArticle({
          seoDescription: "El anillo de plata que buscabas.",
          seoTitle: "Anillo de plata 925",
        }),
        locale,
      });

      await expect(metadata()).resolves.toEqual({
        alternates: {
          canonical,
          languages: {
            en: "/en/productos/anillo-de-plata",
            es: "/productos/anillo-de-plata",
            "x-default": "/productos/anillo-de-plata",
          },
        },
        description: "El anillo de plata que buscabas.",
        openGraph: {
          description: "El anillo de plata que buscabas.",
          siteName: "Sample Store",
          title: "Anillo de plata 925",
          type: "website",
          url: canonical,
        },
        title: { absolute: "Anillo de plata 925 · Sample Store" },
      });
    }
  );

  const AT_LIMIT = `${"x".repeat(150)} ${"y".repeat(9)}`;
  const PAST_LIMIT = `${"x".repeat(150)} ${"y".repeat(10)}`;

  test.each([
    [
      "one short line",
      "Plata 925,\n  hecho   a mano.",
      "Plata 925, hecho a mano.",
    ],
    ["exactly 160 characters, kept whole", AT_LIMIT, AT_LIMIT],
    ["161 characters, cut at the last word", PAST_LIMIT, `${"x".repeat(150)}…`],
    [
      "161 characters with no space, cut at 159",
      "z".repeat(161),
      `${"z".repeat(159)}…`,
    ],
  ])(
    "without search texts, titles the article by its name and describes it by %s",
    async (_case, text, description) => {
      const { metadata } = setup({
        article: makeArticle({ description: text }),
      });

      await expect(metadata()).resolves.toMatchObject({
        description,
        openGraph: { description, title: "Anillo de plata", type: "website" },
        title: { absolute: "Anillo de plata · Sample Store" },
      });
    }
  );

  test.each([
    ["es", SPANISH.tagline],
    ["en", ENGLISH.tagline],
  ] as const)(
    "in %s, describes an article with no description by the store's tagline",
    async (locale, tagline) => {
      const { metadata } = setup({
        article: makeArticle({ description: "" }),
        locale,
      });

      await expect(metadata()).resolves.toMatchObject({
        description: tagline,
        openGraph: { description: tagline },
      });
    }
  );

  test("leaves the description out when neither the article nor the store has words", async () => {
    const { metadata } = setup({
      article: makeArticle({ description: "" }),
      store: makeStore({ translations: [] }),
    });

    await expect(metadata()).resolves.toStrictEqual({
      alternates: {
        canonical: "/productos/anillo-de-plata",
        languages: {
          en: "/en/productos/anillo-de-plata",
          es: "/productos/anillo-de-plata",
          "x-default": "/productos/anillo-de-plata",
        },
      },
      description: undefined,
      openGraph: {
        description: undefined,
        siteName: "Sample Store",
        title: "Anillo de plata",
        type: "website",
        url: "/productos/anillo-de-plata",
      },
      title: { absolute: "Anillo de plata · Sample Store" },
    });
  });
});
