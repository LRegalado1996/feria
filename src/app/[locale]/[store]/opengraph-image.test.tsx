import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";

import type { PublicStore } from "@/server/services/store";

import StoreOpenGraphImage, { alt, contentType, size } from "./opengraph-image";

const { getStoreForPath, ImageResponse } = vi.hoisted(() => ({
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
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/cache/store", () => ({ getStoreForPath }));
vi.mock("next/og", () => ({ ImageResponse }));

const SPANISH = {
  description: "Anillos y cadenas.",
  locale: "es",
  tagline: "Joyas en la feria",
} as const;
const ENGLISH = {
  description: "Rings and chains.",
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

function htmlElement(node: Element | null | undefined) {
  if (!(node instanceof HTMLElement)) {
    throw new TypeError("Not an HTML element");
  }

  return node;
}

async function setup({
  locale = "es",
  segment = "sample-store",
  store = makeStore(),
}: { locale?: string; segment?: string; store?: PublicStore } = {}) {
  getStoreForPath.mockImplementation(
    async (asked) => await Promise.resolve(asked === store.slug ? store : null)
  );

  await StoreOpenGraphImage({
    params: Promise.resolve({ locale, store: segment }),
  });
  const [element, options] = ImageResponse.mock.calls[0] ?? [];

  if (!element) {
    throw new Error("No image was drawn");
  }

  const { container } = render(element);
  const card = htmlElement(container.firstElementChild);

  return {
    card,
    image: { options },
    texts: () =>
      [...card.querySelectorAll("div")]
        .filter((node) => node.children.length === 0 && node.textContent)
        .map((node) => node.textContent),
  };
}

describe("StoreOpenGraphImage", () => {
  test("is a 1200×630 PNG with no alt text of its own", () => {
    expect(size).toEqual({ height: 630, width: 1200 });
    expect(contentType).toBe("image/png");
    expect(alt).toBe("");
  });

  test("draws the store's name in capitals and its tagline, at the card's size", async () => {
    const { image, texts } = await setup();

    expect(texts()).toEqual(["SAMPLE STORE", "Joyas en la feria"]);
    expect(image.options).toEqual({ height: 630, width: 1200 });
  });

  test("uses the tagline of the page's language", async () => {
    const { texts } = await setup({ locale: "en" });

    expect(texts()).toEqual(["SAMPLE STORE", "Jewelry at the fair"]);
  });

  test("capitalizes the name the way the page's language does", async () => {
    const { texts } = await setup({
      locale: "es",
      store: makeStore({ name: "Joyería ñandú", translations: [] }),
    });

    expect(texts()).toEqual(["JOYERÍA ÑANDÚ"]);
  });

  test("draws only the name for a store with no texts", async () => {
    const { texts } = await setup({ store: makeStore({ translations: [] }) });

    expect(texts()).toEqual(["SAMPLE STORE"]);
  });

  test("paints the store's background, foreground and accent", async () => {
    const { card } = await setup({
      store: makeStore({
        colorAccent: "#c8f31d",
        colorBackground: "#101010",
        colorForeground: "#fafafa",
      }),
    });

    expect(card.style.background).toBe("#101010");
    expect(card.style.color).toBe("#fafafa");
    expect(htmlElement(card.firstElementChild).style.background).toBe(
      "#c8f31d"
    );
  });

  test("answers 404 for an address that is not a store, drawing nothing", async () => {
    getStoreForPath.mockResolvedValue(null);

    await expect(
      StoreOpenGraphImage({
        params: Promise.resolve({ locale: "es", store: "nobody" }),
      })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(ImageResponse).not.toHaveBeenCalled();
  });
});
