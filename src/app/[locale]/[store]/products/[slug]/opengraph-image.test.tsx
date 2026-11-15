import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { PublishedProduct } from "@/server/services/catalog";
import type { PublicStore } from "@/server/services/store";

import ArticleOpenGraphImage, {
  generateImageMetadata,
} from "./opengraph-image";

const { getStoreForPath, ImageResponse, readPublishedArticle } = vi.hoisted(
  () => ({
    getStoreForPath: vi.fn<(segment: string) => Promise<PublicStore | null>>(),
    // Records what it was asked to draw; the drawing itself is next/og's.
    ImageResponse: vi.fn(
      class FakeImageResponse {
        element: ReactElement;
        options: unknown;

        constructor(element: ReactElement, options: unknown) {
          this.element = element;
          this.options = options;
        }
      }
    ),
    readPublishedArticle:
      vi.fn<
        (
          store: PublicStore,
          slug: string,
          locale: Locale
        ) => Promise<PublishedProduct | null>
      >(),
  })
);

vi.mock("server-only", () => ({}));
vi.mock("@/server/cache/store", () => ({ getStoreForPath }));
vi.mock("@/server/cache/catalog", () => ({ readPublishedArticle }));
vi.mock("next/og", () => ({ ImageResponse }));

/** The space a formatted price keeps between the currency and the amount. */
const NBSP = " ";

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
    translations: [],
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
    description: "Plata 925.",
    id: 41,
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
        url: "/uploads/anillo-2.jpg",
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

function htmlElement(node: Element | null | undefined) {
  if (!(node instanceof HTMLElement)) {
    throw new TypeError("Not an HTML element");
  }

  return node;
}

/** The reads answer for `store` and its `article` only. */
function answer(store: PublicStore, article: PublishedProduct) {
  getStoreForPath.mockImplementation(
    async (asked) => await Promise.resolve(asked === store.slug ? store : null)
  );
  readPublishedArticle.mockImplementation(
    async (asked, slug) =>
      await Promise.resolve(
        asked === store && slug === article.slug ? article : null
      )
  );
}

function setup({
  article = makeArticle(),
  locale = "es",
  slug = article.slug,
  store = makeStore(),
}: {
  article?: PublishedProduct;
  locale?: string;
  slug?: string;
  store?: PublicStore;
} = {}) {
  answer(store, article);
  const params = { locale, slug, store: "sample-store" };

  return {
    draw: async () => {
      await ArticleOpenGraphImage({ params: Promise.resolve(params) });
      const [element, options] = ImageResponse.mock.calls[0] ?? [];

      if (!element) {
        throw new Error("No image was drawn");
      }

      const { container } = render(element);
      const card = htmlElement(container.firstElementChild);

      return {
        card,
        options,
        photo: htmlElement(card.firstElementChild),
        price: htmlElement(card.lastElementChild?.lastElementChild),
        texts: () =>
          [...card.querySelectorAll("div")]
            .filter((node) => node.children.length === 0 && node.textContent)
            .map((node) => node.textContent),
      };
    },
    metadata: async () => await generateImageMetadata({ params }),
    request: async () =>
      await ArticleOpenGraphImage({ params: Promise.resolve(params) }),
    store,
  };
}

describe("ArticleOpenGraphImage", () => {
  test.each([
    ["es", "ANILLO DE PLATA", `US$${NBSP}1.250,50`],
    ["en", "ANILLO DE PLATA", `USD${NBSP}1,250.50`],
  ] as const)(
    "in %s, draws the store's name, the article's name in capitals and its price, at the card's size",
    async (locale, title, price) => {
      const { draw } = setup({ locale });

      const { options, texts } = await draw();

      expect(texts()).toEqual(["Sample Store", title, price]);
      expect(options).toEqual({ height: 630, width: 1200 });
    }
  );

  test("capitalizes accented letters of the name too", async () => {
    const { draw } = setup({
      article: makeArticle({ title: "Anillo ñandú" }),
    });

    const { texts } = await draw();

    expect(texts()).toEqual([
      "Sample Store",
      "ANILLO ÑANDÚ",
      `US$${NBSP}1.250,50`,
    ]);
  });

  test("covers its photo block with the article's first photo, by its absolute address", async () => {
    const { draw } = setup();

    const { photo } = await draw();

    expect(photo.style.backgroundImage).toBe(
      'url("http://localhost:3000/uploads/anillo.jpg")'
    );
    expect(photo.style.backgroundSize).toBe("cover");
  });

  test("paints the photo block in the store's contrast color when the article has no photo", async () => {
    const { draw } = setup({ article: makeArticle({ images: [] }) });

    const { photo } = await draw();

    expect(photo.style.backgroundImage).toBe("");
    expect(photo.style.backgroundColor).toBe("#3d1f47");
  });

  test("paints the store's background, foreground and contrast", async () => {
    const { draw } = setup({
      article: makeArticle({ images: [] }),
      store: makeStore({
        colorBackground: "#101010",
        colorContrast: "#c8f31d",
        colorForeground: "#fafafa",
      }),
    });

    const { card, photo, price } = await draw();

    expect(card.style.background).toBe("#101010");
    expect(card.style.color).toBe("#fafafa");
    expect(photo.style.backgroundColor).toBe("#c8f31d");
    expect(price.style.background).toBe("#c8f31d");
    expect(price.style.color).toBe("#101010");
  });

  test("answers 404 for an address that is not a store, asking for no article", async () => {
    const { request } = setup({ store: makeStore({ slug: "elsewhere" }) });

    await expect(request()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(readPublishedArticle).not.toHaveBeenCalled();
    expect(ImageResponse).not.toHaveBeenCalled();
  });

  test("answers 404 for an article the store does not publish, drawing nothing", async () => {
    const { request, store } = setup({ slug: "borrador" });

    await expect(request()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(readPublishedArticle).toHaveBeenCalledExactlyOnceWith(
      store,
      "borrador",
      "es"
    );
    expect(ImageResponse).not.toHaveBeenCalled();
  });
});

describe("generateImageMetadata", () => {
  test.each([
    ["the article", "Anillo de plata", {}],
    ["a missing store", "", { store: makeStore({ slug: "elsewhere" }) }],
    ["a missing article", "", { slug: "borrador" }],
    ["a language the product does not speak", "", { locale: "fr" }],
  ] as const)(
    "for %s, describes one 1200×630 PNG card whose alt text is %j",
    async (_case, alt, options) => {
      const { metadata } = setup(options);

      await expect(metadata()).resolves.toEqual([
        {
          alt,
          contentType: "image/png",
          id: "card",
          size: { height: 630, width: 1200 },
        },
      ]);
    }
  );

  test("asks for the article in the page's language, in that store", async () => {
    const { metadata, store } = setup({ locale: "en" });

    await metadata();

    expect(getStoreForPath).toHaveBeenCalledExactlyOnceWith("sample-store");
    expect(readPublishedArticle).toHaveBeenCalledExactlyOnceWith(
      store,
      "anillo-de-plata",
      "en"
    );
  });

  test("asks for no article in a language the product does not speak", async () => {
    const { metadata } = setup({ locale: "fr" });

    await metadata();

    expect(readPublishedArticle).not.toHaveBeenCalled();
  });
});
