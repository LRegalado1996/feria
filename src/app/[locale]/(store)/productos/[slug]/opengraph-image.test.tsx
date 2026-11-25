import { render } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { PublishedProduct } from "@/server/services/catalog";
import type { PublicStore } from "@/server/services/store";
import { server } from "@/test/msw";

import ArticleOpenGraphImage, {
  generateImageMetadata,
} from "./opengraph-image";

const {
  captureExceptionWithScope,
  cardJpeg,
  ImageResponse,
  readBlobStore,
  readPublishedArticle,
  readStore,
} = vi.hoisted(() => ({
  captureExceptionWithScope:
    vi.fn<(error: unknown, scope: { action: string }) => string | null>(),
  // The encoder has its own tests: here it answers bytes of its own.
  cardJpeg: vi.fn(
    async (_png: ArrayBuffer, _background: string): Promise<Buffer> =>
      await Promise.resolve(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 7]))
  ),
  // Records what it was asked to draw; the drawing itself is next/og's.
  // Its PNG is four bytes, and it caches as the real one says it does.
  ImageResponse: vi.fn(
    class FakeImageResponse {
      element: ReactElement;
      headers = new Headers({
        "cache-control": "public, immutable, no-transform, max-age=31536000",
      });
      options: unknown;

      constructor(element: ReactElement, options: unknown) {
        this.element = element;
        this.options = options;
      }

      async arrayBuffer(): Promise<ArrayBuffer> {
        return await Promise.resolve(
          new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer
        );
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
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
  // No Blob store unless a test gives the deployment one.
  readBlobStore: vi.fn(
    (): { host: string; namespace: "production"; token: string } | null => null
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/cache/store", () => ({ readStore }));
vi.mock("@/server/cache/catalog", () => ({ readPublishedArticle }));
vi.mock("next/og", () => ({ ImageResponse }));
// The photo's cached read runs as a plain function outside a Next render.
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("@/server/api/utils/blob-store", () => ({ readBlobStore }));
vi.mock("@/lib/seo/card-jpeg", () => ({ cardJpeg }));
vi.mock("@/lib/sentry", () => ({ captureExceptionWithScope }));

// Five distinct colors, so each part of the card shows which one it took.
// The real file pairs the foreground and the contrast on one color.
vi.mock("@/styles/theme", () => ({
  STORE_THEME: {
    accent: "#aa0001",
    background: "#bb0002",
    contrast: "#cc0003",
    foreground: "#dd0004",
    surface: "#ee0005",
  },
}));

/** The space a formatted price keeps between the currency and the amount. */
const NBSP = "\u00A0";
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

function makeStore(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    currencyCode: "USD",
    id: 7,
    instagramUrl: null,
    name: "Sample Store",
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

/**
 * The store's reads answer `store` (`null`: its row is missing) and its
 * `article` only.
 */
function setup({
  article = makeArticle(),
  locale = "es",
  slug = article.slug,
  store = makeStore(),
}: {
  article?: PublishedProduct;
  locale?: string;
  slug?: string;
  store?: PublicStore | null;
} = {}) {
  readStore.mockResolvedValue(store);
  // This site answers its photos, as the seed's are served.
  server.use(
    http.get(
      "http://localhost:3000/uploads/*",
      () =>
        new HttpResponse(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
          headers: { "content-type": "image/jpeg" },
        })
    )
  );
  readPublishedArticle.mockImplementation(
    async (asked, askedSlug) =>
      await Promise.resolve(
        asked === store && askedSlug === article.slug ? article : null
      )
  );
  const params = { locale, slug };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The style of the card's photo block, as the element handed to the renderer has it. */
function photoBlockStyle(card: unknown): Record<string, unknown> {
  const children: unknown =
    isValidElement(card) && isRecord(card.props) ? card.props.children : null;
  const block: unknown = Array.isArray(children) ? children[0] : children;

  return isValidElement(block) &&
    isRecord(block.props) &&
    isRecord(block.props.style)
    ? block.props.style
    : {};
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

  test("covers its photo block with the article's first photo on this site, from the bytes it fetched", async () => {
    const { draw } = setup();

    const { photo } = await draw();

    expect(photo.style.backgroundImage).toBe(
      'url("data:image/jpeg;base64,/9j/4A==")'
    );
    expect(photo.style.backgroundSize).toBe("cover");
  });

  test("draws a photo of the deployment's Blob store from the bytes it fetched (FER-049)", async () => {
    const host = "store123.public.blob.vercel-storage.com";
    const url = `https://${host}/production/product/0b6f1a0e-6d1c-4c0a-9a43-6c5a3f0e2b11.webp`;
    readBlobStore.mockReturnValue({
      host,
      namespace: "production",
      token: "vercel_blob_rw_store123_secret",
    });
    server.use(
      http.get(
        url,
        () =>
          new HttpResponse(
            new Uint8Array([
              0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
            ]),
            { headers: { "content-type": "image/webp" } }
          )
      )
    );
    const { draw } = setup({
      article: makeArticle({
        images: [{ alt: "Anillo", height: 800, id: 1, url, width: 800 }],
      }),
    });

    const { photo } = await draw();

    expect(photo.style.backgroundImage).toBe(
      'url("data:image/webp;base64,UklGRgQAAABXRUJQ")'
    );
  });

  test.each([
    ["on another host", "https://cdn.example/anillo.jpg"],
    ["at the cloud's metadata address", "http://169.254.169.254/latest"],
  ])(
    "never fetches a photo stored %s: the block keeps the contrast color",
    async (_case, url) => {
      const { draw } = setup({
        article: makeArticle({
          images: [{ alt: "Anillo", height: 800, id: 1, url, width: 800 }],
        }),
      });

      const { photo } = await draw();

      // The shorthand alone: no address to draw.
      expect(photo.style.backgroundImage).not.toContain("url(");
      expect(photo.style.backgroundColor).toBe("#cc0003");
    }
  );

  test("answers the card as a JPEG, light enough for WhatsApp: the renderer's PNG encoded, cached as the renderer says", async () => {
    const { request } = setup();

    const response = await request();

    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe(
      "public, immutable, no-transform, max-age=31536000"
    );
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      0xff, 0xd8, 0xff, 0xe0, 7,
    ]);
    // Handed the PNG the renderer drew, whole, and the card's background.
    const [png, background] = cardJpeg.mock.calls[0] ?? [];
    expect(background).toBe("#bb0002");
    expect([...new Uint8Array(png ?? new ArrayBuffer(0))]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
  });

  test("an encoder that fails still answers the card, as the PNG it was, and is reported", async () => {
    const failure = new Error("The encoder is not there");
    cardJpeg.mockRejectedValueOnce(failure);
    const { request } = setup();

    const response = await request();

    expect(response.headers.get("content-type")).toBe("image/png");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(failure, {
      action: "ShareCard.encode_jpeg",
    });
  });

  test("paints the photo block in the contrast color when the article has no photo", async () => {
    const { draw } = setup({ article: makeArticle({ images: [] }) });

    const { photo } = await draw();

    // The shorthand alone: no address to draw.
    expect(photo.style.backgroundImage).not.toContain("url(");
    expect(photo.style.backgroundColor).toBe("#cc0003");
  });

  test("a card with no photo names no background image at all: the renderer fails on one of `undefined`, and the card with it", async () => {
    const { request } = setup({ article: makeArticle({ images: [] }) });

    await request();

    // The element as the renderer gets it, not as a browser would draw it.
    const [element] = ImageResponse.mock.calls[0] ?? [];
    const style = photoBlockStyle(element);
    expect(Object.keys(style)).not.toContain("backgroundImage");
    expect(style.background).toBe("#cc0003");
  });

  test("paints the theme's background, foreground and contrast, never the store's data", async () => {
    const { draw } = setup({ article: makeArticle({ images: [] }) });

    const { card, photo, price } = await draw();

    expect(card.style.background).toBe("#bb0002");
    expect(card.style.color).toBe("#dd0004");
    expect(photo.style.backgroundColor).toBe("#cc0003");
    expect(price.style.background).toBe("#cc0003");
    expect(price.style.color).toBe("#bb0002");
  });

  test.each([
    ["the build's sample", "__sample__"],
    ["an address with spaces", " anillo "],
  ])(
    "answers 404 for %s before the store is read, drawing nothing",
    async (_case, slug) => {
      const { request } = setup({ slug });

      await expect(request()).rejects.toMatchObject(NOT_FOUND);
      expect(readStore).not.toHaveBeenCalled();
      expect(readPublishedArticle).not.toHaveBeenCalled();
      expect(ImageResponse).not.toHaveBeenCalled();
    }
  );

  test("answers 404 when the store's row is missing, asking for no article", async () => {
    const { request } = setup({ store: null });

    await expect(request()).rejects.toMatchObject(NOT_FOUND);
    expect(readPublishedArticle).not.toHaveBeenCalled();
    expect(ImageResponse).not.toHaveBeenCalled();
  });

  test("answers 404 for an article the store does not publish, drawing nothing", async () => {
    const { request, store } = setup({ slug: "borrador" });

    await expect(request()).rejects.toMatchObject(NOT_FOUND);
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
    ["a missing store row", "", { store: null }],
    ["a missing article", "", { slug: "borrador" }],
    ["the build's sample", "", { slug: "__sample__" }],
    ["a language the product does not speak", "", { locale: "fr" }],
  ] as const)(
    "for %s, describes one 1200×630 JPEG card whose alt text is %j",
    async (_case, alt, options) => {
      const { metadata } = setup(options);

      await expect(metadata()).resolves.toEqual([
        {
          alt,
          contentType: "image/jpeg",
          id: "card",
          size: { height: 630, width: 1200 },
        },
      ]);
    }
  );

  test("asks for the article in the page's language, in the store", async () => {
    const { metadata, store } = setup({ locale: "en" });

    await metadata();

    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    expect(readPublishedArticle).toHaveBeenCalledExactlyOnceWith(
      store,
      "anillo-de-plata",
      "en"
    );
  });

  test.each([
    ["a language the product does not speak", { locale: "fr" }],
    ["the build's sample", { slug: "__sample__" }],
  ] as const)("reads nothing for %s", async (_case, options) => {
    const { metadata } = setup(options);

    await metadata();

    expect(readStore).not.toHaveBeenCalled();
    expect(readPublishedArticle).not.toHaveBeenCalled();
  });
});
