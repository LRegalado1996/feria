import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { StoreCartProps } from "@/app/_components/organisms/store-cart";
import type { PublicStore } from "@/server/services/store";

import CartPage, { ensureStatic, generateMetadata, instant } from "./page";

const { cartProps, getStoreForPath } = vi.hoisted(() => ({
  cartProps: vi.fn<(props: StoreCartProps) => void>(),
  getStoreForPath: vi.fn<(segment: string) => Promise<PublicStore | null>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The cached read has its own tests; here it answers by the segment it got.
vi.mock("@/server/cache/store", () => ({ getStoreForPath }));

// The cart has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/store-cart", () => ({
  StoreCart: (props: StoreCartProps) => {
    cartProps(props);
    return <div data-testid="store-cart">{props.storeSlug}</div>;
  },
}));

function makeStore(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    colorAccent: "#ff8a3d",
    colorBackground: "#fff4e6",
    colorContrast: "#3d1f47",
    colorForeground: "#2b1a12",
    colorSurface: "#ffffff",
    currencyCode: "UYU",
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

async function makeParams(locale: string, store = "sample-store") {
  return await Promise.resolve({ locale, store });
}

/** The cached read answers for `sample-store` only. */
function setup({
  locale = "es",
  segment = "sample-store",
}: { locale?: string; segment?: string } = {}) {
  const store = makeStore();
  getStoreForPath.mockImplementation(
    async (asked) => await Promise.resolve(asked === store.slug ? store : null)
  );

  return {
    metadata: async () =>
      await generateMetadata({ params: makeParams(locale, segment) }),
    page: async () => await CartPage({ params: makeParams(locale, segment) }),
  };
}

describe("CartPage", () => {
  test("shows the store's cart inside the page's main landmark, handing it the store's slug", async () => {
    const { page } = setup();

    render(await page());

    expect(screen.getByTestId("store-cart-page").tagName).toBe("MAIN");
    expect(screen.getByTestId("store-cart-page")).toContainElement(
      screen.getByTestId("store-cart")
    );
    expect(cartProps).toHaveBeenCalledExactlyOnceWith({
      storeSlug: "sample-store",
    });
    expect(getStoreForPath).toHaveBeenCalledExactlyOnceWith("sample-store");
  });

  test("answers 404 for an address that is not an active store, showing no cart", async () => {
    const { page } = setup({ segment: "nobody" });

    await expect(page()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(getStoreForPath).toHaveBeenCalledExactlyOnceWith("nobody");
    expect(cartProps).not.toHaveBeenCalled();
  });

  test("is complete static output, so the store lookup runs before the status is sent", () => {
    expect(ensureStatic).toBe("navigation");
  });

  test("says it blocks on purpose, so the development check does not flag every visit", () => {
    expect(instant).toBe(false);
  });
});

describe("generateMetadata", () => {
  test.each([
    ["es", "/sample-store/cart", "Tu carrito"],
    ["en", "/en/sample-store/cart", "Your cart"],
  ] as const)(
    "titles the %s cart in its language, never indexed, with both addresses",
    async (locale, canonical, title) => {
      const { metadata } = setup({ locale });

      await expect(metadata()).resolves.toEqual({
        alternates: {
          canonical,
          languages: {
            en: "/en/sample-store/cart",
            es: "/sample-store/cart",
            "x-default": "/sample-store/cart",
          },
        },
        robots: { follow: true, index: false },
        title,
      });
    }
  );

  test("adds nothing for an address that is not a store: the 404 page titles itself", async () => {
    const { metadata } = setup({ segment: "nobody" });

    await expect(metadata()).resolves.toEqual({});
  });

  test("answers 404 for a language the product does not speak, before any lookup", async () => {
    const { metadata } = setup({ locale: "fr" });

    await expect(metadata()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(getStoreForPath).not.toHaveBeenCalled();
  });
});
