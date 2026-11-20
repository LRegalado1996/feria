import { ORPCError } from "@orpc/client";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { StoreOrderProps } from "@/app/_components/organisms/store-order";
import type { Locale } from "@/lib/i18n/config";
import type { PublicStore } from "@/server/services/store";
import { DICTIONARIES } from "@/test/i18n";

import OrderPage, { generateMetadata, instant } from "./page";

const {
  frameProps,
  getByToken,
  orderProps,
  readCategories,
  readCategoryArticles,
  readCategoryCounts,
  readStore,
  shellOf,
} = vi.hoisted(() => ({
  frameProps: vi.fn<(props: Record<string, unknown>) => void>(),
  readCategories:
    vi.fn<
      (
        store: unknown,
        locale: string
      ) => Promise<{ id: number; name: string; path: string }[]>
    >(),
  readCategoryArticles:
    vi.fn<
      (store: unknown, categoryId: number, locale: string) => Promise<unknown[]>
    >(),
  readCategoryCounts:
    vi.fn<
      (store: unknown) => Promise<{ categoryId: number; count: number }[]>
    >(),
  getByToken:
    vi.fn<(input: { token: string }) => Promise<StoreOrderProps["order"]>>(),
  orderProps: vi.fn<(props: StoreOrderProps) => void>(),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
  shellOf: vi.fn((store: { name: string }, locale: string) => ({
    shellOf: `${store.name} ${locale}`,
  })),
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

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The cached read has its own tests; here it answers what the test says.
vi.mock("@/server/cache/store", () => ({ readStore }));
vi.mock("@/server/cache/catalog", () => ({
  readCategories,
  readCategoryArticles,
  readCategoryCounts,
}));

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

const TOKEN = "T".repeat(43);

function makeStore(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    currencyCode: "UYU",
    id: 7,
    instagramUrl: null,
    name: "LR Market",
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
 * The order is found by `TOKEN` only, unless `failure` says how the read
 * fails; `store: null` is a database whose store row is missing.
 */
function setup({
  counts = [
    { categoryId: 3, count: 6 },
    { categoryId: 4, count: 5 },
  ],
  draw = 0,
  failure,
  locale = "es",
  store = makeStore(),
  token = TOKEN,
}: {
  counts?: { categoryId: number; count: number }[];
  /** What `Math.random` answers: which category the row draws. */
  draw?: number;
  failure?: Error;
  locale?: string;
  store?: PublicStore | null;
  token?: string;
} = {}) {
  readStore.mockResolvedValue(store);
  vi.spyOn(Math, "random").mockReturnValue(draw);
  readCategoryCounts.mockResolvedValue(counts);
  readCategories.mockResolvedValue([
    { id: 3, name: "Burbujeros", path: "/burbujeros" },
    { id: 4, name: "Anillos", path: "/bijouterie/anillos" },
  ]);
  readCategoryArticles.mockImplementation(
    async (_store, categoryId) =>
      await Promise.resolve([
        { id: categoryId * 100, title: `Article ${categoryId}` },
      ])
  );
  getByToken.mockImplementation(async (input) => {
    if (failure) {
      throw failure;
    }

    if (input.token === TOKEN) {
      return await Promise.resolve(makeOrder());
    }

    throw new ORPCError("NOT_FOUND", { message: "Order not found" });
  });
  const params = async () => await Promise.resolve({ locale, token });
  const page: Boundary = OrderPage({ params: params() });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    metadata: async () => await generateMetadata({ params: params() }),
    resolve: async () => await inner.type(inner.props),
  };
}

// `Math.random` is the real one again after every test.
afterEach(() => {
  vi.restoreAllMocks();
});

const NOT_FOUND_DIGEST = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

describe("OrderPage", () => {
  test("streams the order behind a boundary that shows nothing meanwhile", () => {
    const { fallback } = setup();

    expect(fallback).toBeNull();
  });

  test.each([
    ["es", "/productos", "/burbujeros"],
    ["en", "/en/productos", "/en/burbujeros"],
  ] as const)(
    "hands the order its %s words, catalog link, row and the order read by its token",
    async (locale, catalogHref, againHref) => {
      const { resolve } = setup({ locale });

      render(await resolve());

      expect(screen.getByTestId("store-order-page").tagName).toBe("MAIN");
      expect(screen.getByTestId("store-order-page")).toHaveTextContent(
        /^K7P2Q$/u
      );
      expect(orderProps).toHaveBeenCalledExactlyOnceWith({
        again: {
          articles: [{ id: 300, title: "Article 3" }],
          href: againHref,
          name: "Burbujeros",
        },
        catalogHref,
        copy: DICTIONARIES[locale].storefront,
        locale,
        order: makeOrder(),
        whatsappHref: null,
      });
      expect(readCategoryArticles).toHaveBeenCalledExactlyOnceWith(
        makeStore(),
        3,
        locale
      );
      expect(getByToken).toHaveBeenCalledExactlyOnceWith({ token: TOKEN });
    }
  );

  test("sits in the store's frame, made from the store it read, in the page's language", async () => {
    const { resolve } = setup({ locale: "en" });

    render(await resolve());

    expect(screen.getByTestId("store-frame")).toContainElement(
      screen.getByTestId("store-order-page")
    );
    expect(frameProps).toHaveBeenCalledExactlyOnceWith({
      copy: DICTIONARIES.en.storefront.shell,
      locale: "en",
      shellOf: "LR Market en",
    });
  });

  test("ends with the store's footer, after the order, in the page's language", async () => {
    const { resolve } = setup({ locale: "en" });

    render(await resolve());

    expect(screen.getByTestId("footer")).toHaveTextContent(/^LR Market en$/u);
    expect(
      screen
        .getByTestId("store-order-page")
        .compareDocumentPosition(screen.getByTestId("footer"))
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

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

  test("draws the row's category at random per visit, among those with articles", async () => {
    const { resolve } = setup({ draw: 0.99 });

    render(await resolve());

    expect(orderProps).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        again: {
          articles: [{ id: 400, title: "Article 4" }],
          href: "/bijouterie/anillos",
          name: "Anillos",
        },
      })
    );
    expect(readCategoryCounts).toHaveBeenCalledExactlyOnceWith(makeStore());
  });

  test.each([
    ["no category has a published article", []],
    ["the drawn category is gone from the list", [{ categoryId: 9, count: 4 }]],
  ])("shows no row when %s", async (_case, counts) => {
    const { resolve } = setup({ counts });

    render(await resolve());

    expect(orderProps).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ again: null })
    );
    expect(readCategoryArticles).not.toHaveBeenCalled();
  });

  test("answers 404 for a token of another order", async () => {
    const { resolve } = setup({ token: "U".repeat(43) });

    await expect(resolve()).rejects.toMatchObject(NOT_FOUND_DIGEST);
    expect(orderProps).not.toHaveBeenCalled();
  });

  test("answers 404 when the store's row is missing, without asking for the order", async () => {
    const { resolve } = setup({ store: null });

    await expect(resolve()).rejects.toMatchObject(NOT_FOUND_DIGEST);
    expect(getByToken).not.toHaveBeenCalled();
    expect(orderProps).not.toHaveBeenCalled();
  });

  test.each([
    ["one character short", "T".repeat(42)],
    ["one character long", "T".repeat(44)],
    ["a character a token never has", `${"T".repeat(42)}.`],
  ])(
    "answers 404 for a token %s without reading the store or any order",
    async (_case, token) => {
      const { resolve } = setup({ token });

      await expect(resolve()).rejects.toMatchObject(NOT_FOUND_DIGEST);
      expect(readStore).not.toHaveBeenCalled();
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
    ["es", "Pedido K7P2Q · LR Market"],
    ["en", "Order K7P2Q · LR Market"],
  ] as const)(
    "titles the %s page after the order's code and the store, never indexed nor followed, and sends no referrer",
    async (locale, title) => {
      const { metadata } = setup({ locale });

      await expect(metadata()).resolves.toEqual({
        referrer: "no-referrer",
        robots: { follow: false, index: false },
        title: { absolute: title },
      });
    }
  );

  test.each([
    ["an order that is not there", { token: "U".repeat(43) }],
    ["a malformed token", { token: "short" }],
    ["a missing store row", { store: null }],
  ])(
    "for %s is still never indexed nor a referrer, and leaves the title to the 404 page",
    async (_case, options) => {
      const { metadata } = setup(options);

      await expect(metadata()).resolves.toEqual({
        referrer: "no-referrer",
        robots: { follow: false, index: false },
      });
    }
  );
});
