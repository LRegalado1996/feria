import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { StoreCartProps } from "@/app/_components/organisms/store-cart";
import { getDictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import type { PublicStore } from "@/server/services/store";
import { holdRequest, settle } from "@/test/connection";

import * as cartModule from "./page";

const { cartProps, connection, frameProps, readStore, streamedShell } =
  vi.hoisted(() => ({
    cartProps: vi.fn<(props: StoreCartProps) => void>(),
    connection: vi.fn(async () => undefined),
    frameProps: vi.fn<(props: Record<string, unknown>) => void>(),
    readStore: vi.fn<() => Promise<PublicStore | null>>(),
    streamedShell: vi.fn((locale: string) => ({ shellOf: locale })),
  }));

// The frame's streamed parts have their own tests (`store-shell.test.ts`).
vi.mock("../store-shell", () => ({ streamedShell }));

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

// The cart has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/store-cart", () => ({
  StoreCart: (props: StoreCartProps) => {
    cartProps(props);
    return <div data-testid="store-cart" />;
  },
}));

// The footer has its own tests; here it only shows in which language.
vi.mock("../store-page-footer", () => ({
  StreamedStoreFooter: ({ locale }: { locale: Locale }) => (
    <footer data-testid="footer">{locale}</footer>
  ),
}));

const { default: CartPage, generateMetadata } = cartModule;

function makeStore(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    currencyCode: "UYU",
    id: 7,
    instagramUrl: null,
    name: "Sample Store",
    tiktokUrl: null,
    translations: [],
    whatsappNumber: null,
    ...overrides,
  };
}

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

function setup({
  locale = "es",
  store = makeStore(),
}: { locale?: string; store?: PublicStore | null } = {}) {
  readStore.mockResolvedValue(store);

  return {
    metadata: async () =>
      await generateMetadata({ params: makeParams(locale) }),
    page: async () => await CartPage({ params: makeParams(locale) }),
  };
}

describe("CartPage", () => {
  test("shows the cart inside the page's main landmark, then the footer streamed in the page's language", async () => {
    const { page } = setup({ locale: "en" });

    render(await page());

    const main = screen.getByTestId("store-cart-page");
    expect(main.tagName).toBe("MAIN");
    expect(main).toContainElement(screen.getByTestId("store-cart"));
    expect(cartProps).toHaveBeenCalledExactlyOnceWith({});
    expect(screen.getByTestId("footer")).toHaveTextContent(/^en$/u);
    expect(main.compareDocumentPosition(screen.getByTestId("footer"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  test("sits in the store's frame, with the shell's words and what streams of the store", async () => {
    const { page } = setup({ locale: "en" });

    render(await page());

    expect(screen.getByTestId("store-frame")).toContainElement(
      screen.getByTestId("store-cart-page")
    );
    expect(frameProps).toHaveBeenCalledExactlyOnceWith({
      copy: getDictionary("en").storefront.shell,
      locale: "en",
      shellOf: "en",
    });
  });

  test("reads nothing of the store itself: the cart lives in the browser and the page is prerendered", async () => {
    const { page } = setup();

    render(await page());

    expect(readStore).not.toHaveBeenCalled();
    expect(connection).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, showing no cart", async () => {
    const { page } = setup({ locale: "fr" });

    await expect(page()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(cartProps).not.toHaveBeenCalled();
  });

  test("blocks on nothing: no static-output or instant-navigation exemption", () => {
    expect(new Set(Object.keys(cartModule))).toEqual(
      new Set(["default", "generateMetadata"])
    );
  });
});

describe("generateMetadata", () => {
  test.each([
    ["es", "/cart", "Tu carrito · Sample Store"],
    ["en", "/en/cart", "Your cart · Sample Store"],
  ] as const)(
    "titles the %s cart in its language after the store, never indexed, with both addresses",
    async (locale, canonical, title) => {
      const { metadata } = setup({ locale });

      await expect(metadata()).resolves.toEqual({
        alternates: {
          canonical,
          languages: { en: "/en/cart", es: "/cart", "x-default": "/cart" },
        },
        robots: { follow: true, index: false },
        title: { absolute: title },
      });
    }
  );

  test("reads the store only once a request is there, so the build needs no database", async () => {
    const { metadata } = setup();
    const request = holdRequest(connection);

    const pending = metadata();
    await settle();

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).not.toHaveBeenCalled();

    request.arrive();

    await expect(pending).resolves.toMatchObject({
      title: { absolute: "Tu carrito · Sample Store" },
    });
    expect(readStore).toHaveBeenCalledExactlyOnceWith();
  });

  test("keeps the cart's own title when the store's row is missing", async () => {
    const { metadata } = setup({ store: null });

    await expect(metadata()).resolves.toMatchObject({
      title: { absolute: "Tu carrito" },
    });
  });

  test("answers 404 for a language the product does not speak, before any read", async () => {
    const { metadata } = setup({ locale: "fr" });

    await expect(metadata()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(readStore).not.toHaveBeenCalled();
  });
});
