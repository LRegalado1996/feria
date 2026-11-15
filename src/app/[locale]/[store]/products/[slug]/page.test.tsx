import { render, screen } from "@testing-library/react";
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

const { articleProps, getStoreForPath, readPublishedArticle, readRelated } =
  vi.hoisted(() => ({
    articleProps: vi.fn<(props: StoreArticleProps) => void>(),
    getStoreForPath: vi.fn<(segment: string) => Promise<PublicStore | null>>(),
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
  }));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The cached reads have their own tests; here they answer by what they got.
vi.mock("@/server/cache/store", () => ({ getStoreForPath }));
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

async function makeParams(
  locale: string,
  slug = "anillo-de-plata",
  store = "sample-store"
) {
  return await Promise.resolve({ locale, slug, store });
}

/** The reads answer for `store` and its `article` only. */
function setup({
  article = makeArticle(),
  locale = "es",
  related = [makeCard()],
  slug = article.slug,
  store = makeStore(),
}: {
  article?: PublishedProduct;
  locale?: string;
  related?: ProductCard[];
  slug?: string;
  store?: PublicStore;
} = {}) {
  getStoreForPath.mockImplementation(
    async (asked) => await Promise.resolve(asked === store.slug ? store : null)
  );
  readPublishedArticle.mockImplementation(
    async (asked, askedSlug) =>
      await Promise.resolve(
        asked === store && askedSlug === article.slug ? article : null
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

  test("answers 404 for an address that is not a store, asking for no article", async () => {
    const { resolve } = setup({ store: makeStore({ slug: "elsewhere" }) });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(getStoreForPath).toHaveBeenCalledExactlyOnceWith("sample-store");
    expect(readPublishedArticle).not.toHaveBeenCalled();
  });

  test("answers 404 for an article the store does not publish, asking for nothing beside it", async () => {
    const { resolve, store } = setup({ slug: "borrador" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(readPublishedArticle).toHaveBeenCalledExactlyOnceWith(
      store,
      "borrador",
      "es"
    );
    expect(readRelated).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any lookup", async () => {
    const { resolve } = setup({ locale: "fr" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(getStoreForPath).not.toHaveBeenCalled();
  });

  test.each(["es", "en"] as const)(
    "in %s, hands the organism the article, the copy of that language and the articles beside it",
    async (locale) => {
      const { article, related, show, store } = setup({ locale });

      const { props } = await show();

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
        store,
        whatsappHref: null,
      });
      expect(screen.getByTestId("store-article").parentElement?.tagName).toBe(
        "MAIN"
      );
    }
  );

  test.each([
    [
      "es",
      "¡Hola! Te escribo por «Aros & cadenas»: http://localhost:3000/sample-store/products/aros-y-cadenas",
    ],
    [
      "en",
      "Hi! I'm writing about “Aros & cadenas”: http://localhost:3000/en/sample-store/products/aros-y-cadenas",
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

  test("describes the article, its trail and its store as structured data", async () => {
    const { show } = setup({
      article: makeArticle({
        category: { name: "Anillos", slug: "anillos" },
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
        logoUrl: "https://cdn.example.test/logo.png",
        tiktokUrl: "https://tiktok.com/@sample",
      }),
    });

    const { jsonLd } = await show();
    const url = `${ORIGIN}/sample-store/products/anillo-de-plata`;

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
            item: `${ORIGIN}/sample-store`,
            name: "Sample Store",
            position: 1,
          },
          {
            "@type": "ListItem",
            item: `${ORIGIN}/sample-store/products`,
            name: "Catálogo",
            position: 2,
          },
          {
            "@type": "ListItem",
            item: `${ORIGIN}/sample-store/products?category=anillos`,
            name: "Anillos",
            position: 3,
          },
          {
            "@type": "ListItem",
            item: url,
            name: "Anillo de plata",
            position: 4,
          },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        logo: "https://cdn.example.test/logo.png",
        name: "Sample Store",
        sameAs: ["https://instagram.com/sample", "https://tiktok.com/@sample"],
        url: `${ORIGIN}/sample-store`,
      },
    ]);
  });

  test("in English, trails an article with no category from the store through the catalog, in English addresses", async () => {
    const { show } = setup({ locale: "en" });

    const { jsonLd } = await show();
    const url = `${ORIGIN}/en/sample-store/products/anillo-de-plata`;

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
            item: `${ORIGIN}/en/sample-store`,
            name: "Sample Store",
            position: 1,
          },
          {
            "@type": "ListItem",
            item: `${ORIGIN}/en/sample-store/products`,
            name: "Catalog",
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
        name: "Sample Store",
        url: `${ORIGIN}/en/sample-store`,
      },
    ]);
  });
});

describe("generateMetadata", () => {
  test.each([
    ["store", { store: makeStore({ slug: "elsewhere" }) }],
    ["article", { slug: "borrador" }],
  ] as const)(
    "adds nothing when the %s is missing",
    async (_missing, options) => {
      const { metadata } = setup(options);

      await expect(metadata()).resolves.toEqual({});
    }
  );

  test.each([
    ["es", "/sample-store/products/anillo-de-plata"],
    ["en", "/en/sample-store/products/anillo-de-plata"],
  ] as const)(
    "in %s, prefers the article's own search title and description, with both addresses",
    async (locale, canonical) => {
      const { metadata } = setup({
        article: makeArticle({
          seoDescription: "El anillo de plata que buscabas.",
          seoTitle: "Anillo de plata 925 | Sample Store",
        }),
        locale,
      });

      await expect(metadata()).resolves.toEqual({
        alternates: {
          canonical,
          languages: {
            en: "/en/sample-store/products/anillo-de-plata",
            es: "/sample-store/products/anillo-de-plata",
            "x-default": "/sample-store/products/anillo-de-plata",
          },
        },
        description: "El anillo de plata que buscabas.",
        openGraph: {
          description: "El anillo de plata que buscabas.",
          title: "Anillo de plata 925 | Sample Store",
          type: "website",
        },
        title: "Anillo de plata 925 | Sample Store",
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
        title: "Anillo de plata",
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
        canonical: "/sample-store/products/anillo-de-plata",
        languages: {
          en: "/en/sample-store/products/anillo-de-plata",
          es: "/sample-store/products/anillo-de-plata",
          "x-default": "/sample-store/products/anillo-de-plata",
        },
      },
      description: undefined,
      openGraph: {
        description: undefined,
        title: "Anillo de plata",
        type: "website",
      },
      title: "Anillo de plata",
    });
  });
});
