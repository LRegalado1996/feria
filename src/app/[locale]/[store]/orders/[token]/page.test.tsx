import { ORPCError } from "@orpc/client";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { StoreOrderProps } from "@/app/_components/organisms/store-order";
import type { PublicStore } from "@/server/services/store";
import { DICTIONARIES } from "@/test/i18n";

import OrderPage, { generateMetadata, instant } from "./page";

const { getByToken, getStoreForPath, orderProps } = vi.hoisted(() => ({
  getByToken:
    vi.fn<
      (input: {
        storeSlug: string;
        token: string;
      }) => Promise<StoreOrderProps["order"]>
    >(),
  getStoreForPath: vi.fn<(segment: string) => Promise<PublicStore | null>>(),
  orderProps: vi.fn<(props: StoreOrderProps) => void>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The cached read has its own tests; here it answers by the segment it got.
vi.mock("@/server/cache/store", () => ({ getStoreForPath }));

// The procedure has its own tests; here it answers and is spied on for what
// the page asked.
vi.mock("@/lib/orpc/server", () => ({
  caller: { order: { getByToken } },
}));

// The order organism has its own tests; here it records what it was given.
vi.mock("@/app/_components/organisms/store-order", () => ({
  StoreOrder: (props: StoreOrderProps) => {
    orderProps(props);
    return <div data-testid="store-order">{props.order.code}</div>;
  },
}));

const TOKEN = "T".repeat(43);

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
    name: "LR Market",
    slug: "lr-market",
    tiktokUrl: null,
    translations: [],
    whatsappNumber: null,
    ...overrides,
  };
}

function makeOrder(
  overrides: Partial<StoreOrderProps["order"]> = {}
): StoreOrderProps["order"] {
  return {
    code: "K7P2Q",
    currencyCode: "UYU",
    customerPhone: "+598 •••• 456",
    items: [{ quantity: 2, title: "Cadena dorada", unitPriceAmount: 129_000 }],
    note: null,
    status: "received",
    totalAmount: 258_000,
    ...overrides,
  };
}

type Boundary = ReactElement<{
  children: ReactElement<
    { params: unknown },
    (props: { params: unknown }) => Promise<ReactNode>
  >;
  fallback: ReactNode;
}>;

/**
 * `lr-market` is the only store; its order is found by `TOKEN` only, unless
 * `failure` says how the read fails.
 */
function setup({
  failure,
  locale = "es",
  segment = "lr-market",
  store = makeStore(),
  token = TOKEN,
}: {
  failure?: Error;
  locale?: string;
  segment?: string;
  store?: PublicStore;
  token?: string;
} = {}) {
  getStoreForPath.mockImplementation(
    async (asked) => await Promise.resolve(asked === store.slug ? store : null)
  );
  getByToken.mockImplementation(async (input) => {
    if (failure) {
      throw failure;
    }

    if (input.storeSlug === store.slug && input.token === TOKEN) {
      return await Promise.resolve(makeOrder());
    }

    throw new ORPCError("NOT_FOUND", { message: "Order not found" });
  });
  const params = async () =>
    await Promise.resolve({ locale, store: segment, token });
  const page: Boundary = OrderPage({ params: params() });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    metadata: async () => await generateMetadata({ params: params() }),
    resolve: async () => await inner.type(inner.props),
  };
}

const NOT_FOUND_DIGEST = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

describe("OrderPage", () => {
  test("streams the order behind a boundary that shows nothing meanwhile", () => {
    const { fallback } = setup();

    expect(fallback).toBeNull();
  });

  test.each([
    ["es", "/lr-market/products", "(se abre en otra pestaña)"],
    ["en", "/en/lr-market/products", "(opens in a new tab)"],
  ] as const)(
    "hands the order its %s words, catalog link and the order read by its token",
    async (locale, catalogHref, newTabLabel) => {
      const { resolve } = setup({ locale });

      render(await resolve());

      expect(screen.getByTestId("store-order-page").tagName).toBe("MAIN");
      expect(screen.getByTestId("store-order-page")).toHaveTextContent(
        /^K7P2Q$/
      );
      expect(orderProps).toHaveBeenCalledExactlyOnceWith({
        catalogHref,
        labels: DICTIONARIES[locale].storefront.order,
        locale,
        newTabLabel,
        order: makeOrder(),
        whatsappHref: null,
      });
      expect(getByToken).toHaveBeenCalledExactlyOnceWith({
        storeSlug: "lr-market",
        token: TOKEN,
      });
    }
  );

  test.each([
    [
      "es",
      "https://wa.me/59899123456?text=%C2%A1Hola!%20Hice%20el%20pedido%20K7P2Q.",
    ],
    ["en", "https://wa.me/59899123456?text=Hi!%20I%20placed%20order%20K7P2Q."],
  ] as const)(
    "links a chat with the store in %s: its number as digits only, the text naming the order",
    async (locale, whatsappHref) => {
      const { resolve } = setup({
        locale,
        store: makeStore({ whatsappNumber: "+598 99-123 456" }),
      });

      render(await resolve());

      expect(orderProps).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ whatsappHref })
      );
    }
  );

  test.each([
    ["an unknown store", { segment: "nobody" }],
    ["a token of another order", { token: "U".repeat(43) }],
  ])("answers 404 for %s", async (_case, options) => {
    const { resolve } = setup(options);

    await expect(resolve()).rejects.toMatchObject(NOT_FOUND_DIGEST);
    expect(orderProps).not.toHaveBeenCalled();
  });

  test.each([
    ["one character short", "T".repeat(42)],
    ["one character long", "T".repeat(44)],
    ["a character a token never has", `${"T".repeat(42)}.`],
  ])(
    "answers 404 for a token %s without reading any order",
    async (_case, token) => {
      const { resolve } = setup({ token });

      await expect(resolve()).rejects.toMatchObject(NOT_FOUND_DIGEST);
      expect(getByToken).not.toHaveBeenCalled();
    }
  );

  test("lets a failure other than NOT_FOUND reach the error boundary instead of showing a 404", async () => {
    const { resolve } = setup({ failure: new Error("connection refused") });

    await expect(resolve()).rejects.toThrow("connection refused");
    expect(orderProps).not.toHaveBeenCalled();
  });

  test("opts out of the instant-navigation check: it waits for the order by design", () => {
    expect(instant).toBe(false);
  });
});

describe("generateMetadata", () => {
  test.each([
    ["es", "Pedido K7P2Q"],
    ["en", "Order K7P2Q"],
  ] as const)(
    "titles the %s page after the order's code, never indexed nor followed",
    async (locale, title) => {
      const { metadata } = setup({ locale });

      await expect(metadata()).resolves.toEqual({
        robots: { follow: false, index: false },
        title,
      });
    }
  );

  test.each([
    ["an unknown store", { segment: "nobody" }],
    ["an order that is not there", { token: "U".repeat(43) }],
    ["a malformed token", { token: "short" }],
  ])(
    "for %s is still never indexed, and leaves the title to the 404 page",
    async (_case, options) => {
      const { metadata } = setup(options);

      await expect(metadata()).resolves.toEqual({
        robots: { follow: false, index: false },
      });
    }
  );
});
