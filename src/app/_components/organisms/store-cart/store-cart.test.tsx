import { QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CartProduct } from "@/lib/hooks/cart";
import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { StoreCart } from "./store-cart";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// The app's client reports a failed query; that has its own tests.
vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const KEY = "feria:cart:lr-market";
const TOKEN = "c".repeat(43);

function makeProduct(
  id: number,
  overrides: Partial<CartProduct> = {}
): CartProduct {
  return {
    categorySlug: null,
    cover: null,
    currencyCode: "UYU",
    id,
    isAvailable: true,
    lang: "es",
    priceAmount: id * 10_000,
    slug: `articulo-${id}`,
    title: `Artículo ${id}`,
    ...overrides,
  };
}

function makeLine(productId: number, quantity: number, seen?: number) {
  return seen === undefined
    ? { productId, quantity }
    : { productId, quantity, seenPriceAmount: seen };
}

/** Two articles, as added: 2 of article 4 at its price then, 1 of 9. */
const CART = [makeLine(4, 2, 40_000), makeLine(9, 1, 90_000)];

interface SetupOptions {
  cart?: unknown[];
  locale?: Locale;
  /** How `catalog.cartProducts` answers: the articles, a failure or never. */
  products?: "fail" | "hang" | CartProduct[];
}

function setup({
  cart = CART,
  locale = "en",
  products = [makeProduct(4), makeProduct(9)],
}: SetupOptions = {}) {
  localStorage.setItem(KEY, JSON.stringify(cart));
  const cartProducts = vi.fn(async (_input: unknown) =>
    products === "hang" ? await new Promise<never>(() => {}) : products
  );
  server.use(
    products === "fail"
      ? createOrpcErrorHandler("catalog.cartProducts", {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
          status: 500,
        })
      : createOrpcHandler("catalog.cartProducts", cartProducts)
  );
  const wrapper = createQueryWrapper();
  const user = userEvent.setup();
  renderWithI18n(<StoreCart className="custom" storeSlug="lr-market" />, {
    locale,
    wrapper,
  });

  return {
    cartProducts,
    /** The lines on screen, as `[title, flag]`. */
    lines: () =>
      screen
        .getAllByTestId("store-cart-line")
        .map((line) => [
          within(line).queryByRole("link")?.textContent ??
            line.querySelector("p")?.textContent,
          line.dataset.flag ?? null,
        ]),
    shown: async () => await screen.findByTestId("store-cart"),
    storedCart: (): unknown => JSON.parse(localStorage.getItem(KEY) ?? "null"),
    submit: () => screen.getByTestId("store-checkout-submit"),
    total: () =>
      screen.getByTestId("store-cart-total").textContent?.replaceAll(" ", " "),
    user,
  };
}

afterEach(() => {
  localStorage.clear();
});

describe("StoreCart", () => {
  test("lists the stored articles at the shop's prices now, with the total", async () => {
    const { cartProducts, lines, shown, total } = setup();

    await shown();

    expect(
      screen.getByRole("heading", { level: 1, name: "Your cart" })
    ).toBeVisible();
    expect(lines()).toEqual([
      ["Artículo 4", null],
      ["Artículo 9", null],
    ]);
    expect(
      screen.getAllByTestId("store-cart-quantity").map((q) => q.textContent)
    ).toEqual(["2", "1"]);
    // 2 × 400 + 1 × 900.
    expect(total()).toBe("TotalUYU 1,700");
    expect(cartProducts).toHaveBeenCalledExactlyOnceWith({
      ids: [4, 9],
      locale: "en",
      storeSlug: "lr-market",
    });
  });

  test("says when an article's price changed since it was added, and still takes the order", async () => {
    const { lines, shown, submit, total } = setup({
      products: [makeProduct(4, { priceAmount: 50_000 }), makeProduct(9)],
    });

    await shown();

    expect(lines()).toEqual([
      ["Artículo 4", "price_changed"],
      ["Artículo 9", null],
    ]);
    expect(
      screen.getByText("The price changed: it was UYU 400.")
    ).toBeVisible();
    expect(total()).toBe("TotalUYU 1,900");
    expect(submit()).toBeEnabled();
  });

  test("a line added without a seen price is never flagged as changed", async () => {
    const { lines, shown } = setup({ cart: [makeLine(4, 1)] });

    await shown();

    expect(lines()).toEqual([["Artículo 4", null]]);
  });

  test("leaves a sold-out article out of the total and holds the order until it is taken out", async () => {
    const { lines, shown, storedCart, submit, total, user } = setup({
      products: [makeProduct(4), makeProduct(9, { isAvailable: false })],
    });

    await shown();

    expect(lines()).toEqual([
      ["Artículo 4", null],
      ["Artículo 9", "unavailable"],
    ]);
    expect(total()).toBe("TotalUYU 800");
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAccessibleDescription(
      "Remove the articles that can no longer be bought to place the order."
    );

    await user.click(screen.getByRole("button", { name: "Remove Artículo 9" }));

    expect(storedCart()).toEqual([makeLine(4, 2, 40_000)]);
    await waitFor(() => {
      expect(submit()).toBeEnabled();
    });
  });

  test("an article the shop no longer has holds the order", async () => {
    const { lines, shown, submit, total } = setup({
      products: [makeProduct(4)],
    });

    await shown();

    expect(lines()).toEqual([
      ["Artículo 4", null],
      ["No longer for sale.", "gone"],
    ]);
    expect(total()).toBe("TotalUYU 800");
    expect(submit()).toBeDisabled();
    expect(
      screen.getByText(
        "Remove the articles that can no longer be bought to place the order."
      )
    ).toBeVisible();
  });

  test("shows no total when none of the articles is left", async () => {
    const { lines, shown } = setup({ products: [] });

    await shown();

    expect(lines()).toEqual([
      ["No longer for sale.", "gone"],
      ["No longer for sale.", "gone"],
    ]);
    expect(screen.queryByTestId("store-cart-total")).toBeNull();
  });

  test("a quantity changed is stored", async () => {
    const { shown, storedCart, user } = setup();

    await shown();
    await user.click(
      screen.getByRole("button", { name: "One unit more of Artículo 4" })
    );

    expect(storedCart()).toEqual([
      makeLine(4, 3, 40_000),
      makeLine(9, 1, 90_000),
    ]);
    expect(
      screen.getAllByTestId("store-cart-quantity").map((q) => q.textContent)
    ).toEqual(["3", "1"]);
  });

  test("says the prices are on their way while they load", async () => {
    setup({ products: "hang" });

    expect(
      await screen.findByText("Fetching the current prices…")
    ).toBeVisible();
    expect(screen.queryByTestId("store-cart")).toBeNull();
    expect(screen.queryByTestId("store-cart-empty")).toBeNull();
  });

  test("says the prices could not be read, and reads them again on retry", async () => {
    const { cartProducts, lines, shown, user } = setup({ products: "fail" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not fetch the current prices."
    );
    server.use(createOrpcHandler("catalog.cartProducts", cartProducts));
    cartProducts.mockResolvedValue([makeProduct(4), makeProduct(9)]);
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await shown();
    expect(lines()).toEqual([
      ["Artículo 4", null],
      ["Artículo 9", null],
    ]);
    expect(cartProducts).toHaveBeenCalledExactlyOnceWith({
      ids: [4, 9],
      locale: "en",
      storeSlug: "lr-market",
    });
  });

  test.each([
    ["en", "Your cart is empty.", "Keep browsing", "/en/lr-market/products"],
    ["es", "Tu carrito está vacío.", "Seguir mirando", "/lr-market/products"],
  ] as const)(
    "in %s, an empty cart says %j and links to the catalog",
    async (locale, text, link, href) => {
      const { cartProducts } = setup({ cart: [], locale });

      const empty = await screen.findByTestId("store-cart-empty");

      expect(empty).toHaveTextContent(text);
      expect(within(empty).getByRole("link", { name: link })).toHaveAttribute(
        "href",
        href
      );
      expect(cartProducts).not.toHaveBeenCalled();
    }
  );

  test.each([
    [
      "en",
      "/en/lr-market/orders/",
      "Sending the order…",
      "Your name",
      "Your mobile",
    ],
    [
      "es",
      "/lr-market/orders/",
      "Enviando el pedido…",
      "Tu nombre",
      "Tu celular",
    ],
  ] as const)(
    "in %s, a placed order opens its page at %s and empties the cart, saying it is on its way",
    async (locale, path, sending, nameLabel, phoneLabel) => {
      const { shown, storedCart, user } = setup({ locale });
      const create = vi.fn((_input: unknown) => ({ token: TOKEN }));
      server.use(createOrpcHandler("order.create", create));

      await shown();
      await user.type(
        screen.getByRole("textbox", { name: nameLabel }),
        "Ana Pérez"
      );
      await user.type(
        screen.getByRole("textbox", { name: phoneLabel }),
        "099 123 456"
      );
      await user.click(screen.getByTestId("store-checkout-submit"));

      await waitFor(() => {
        expect(push).toHaveBeenCalledExactlyOnceWith(`${path}${TOKEN}`);
      });
      // Only the articles and quantities: the seen prices stay home.
      expect(create).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          items: [
            { productId: 4, quantity: 2 },
            { productId: 9, quantity: 1 },
          ],
          locale,
          storeSlug: "lr-market",
        })
      );
      expect(storedCart()).toEqual([]);
      expect(screen.getByRole("status")).toHaveTextContent(sending);
      expect(screen.queryByTestId("store-cart-empty")).toBeNull();
    }
  );

  test("an article that changed under the order reads the prices again", async () => {
    const { cartProducts, shown, user } = setup();
    server.use(
      createOrpcErrorHandler("order.create", {
        code: "BAD_REQUEST",
        message: "Article not available",
        status: 400,
      })
    );

    await shown();
    await user.type(
      screen.getByRole("textbox", { name: "Your name" }),
      "Ana Pérez"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Your mobile" }),
      "099 123 456"
    );
    await user.click(screen.getByTestId("store-checkout-submit"));

    await waitFor(() => {
      expect(cartProducts.mock.calls).toEqual([
        [{ ids: [4, 9], locale: "en", storeSlug: "lr-market" }],
        [{ ids: [4, 9], locale: "en", storeSlug: "lr-market" }],
      ]);
    });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("StoreCart before hydration", () => {
  test("reads as loading, not empty, until React reads the cart", () => {
    localStorage.setItem(KEY, "[]");
    const I18n = createI18nWrapper("en");
    const { queryClient } = createQueryWrapper();

    function Providers({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <I18n>{children}</I18n>
        </QueryClientProvider>
      );
    }

    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <Providers>
        <StoreCart storeSlug="lr-market" />
      </Providers>,
      { clientNowMs: 1000, serverNowMs: 0 }
    );

    expect(serverHtml).toContain("Fetching the current prices…");
    expect(serverHtml).not.toContain("Your cart is empty.");
    expect(clientHtml).toContain("Your cart is empty.");
    expect(errors).toEqual([]);
  });
});
