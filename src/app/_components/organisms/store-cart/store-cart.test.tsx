import {
  focusManager,
  onlineManager,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CartProduct } from "@/lib/hooks/cart";
import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, DICTIONARIES, renderWithI18n } from "@/test/i18n";
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

type User = ReturnType<typeof userEvent.setup>;

/** A promise the test settles when it chooses: a slow answer. */
function deferred<T>() {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });

  return { promise, resolve: settle };
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

  const dictionary = DICTIONARIES[locale].storefront.cart.checkout;

  return {
    /** Writes the shopper's details and sends the order. */
    placeOrder: async () => {
      await user.type(
        screen.getByRole("textbox", { name: dictionary.name }),
        "Ana Pérez"
      );
      await user.type(
        screen.getByRole("textbox", { name: dictionary.phone }),
        "099 123 456"
      );
      await user.click(screen.getByTestId("store-checkout-submit"));
    },
    /** The polite announcement of the last line taken out. */
    announcement: () =>
      document.querySelector('[data-slot="store-cart"] > output')
        ?.textContent ?? null,
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
  // Back to the browser's own word on whether the window has focus.
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
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
      ["Article no longer for sale", "gone"],
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
      ["Article no longer for sale", "gone"],
      ["Article no longer for sale", "gone"],
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
    const { cartProducts, lines, shown, submit, user } = setup({
      products: "fail",
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not fetch the current prices."
    );
    // No prices to show: the lines wait for them, and so does the order.
    expect(lines()).toEqual([
      ["Fetching the current prices…", "pending"],
      ["Fetching the current prices…", "pending"],
    ]);
    expect(screen.queryByTestId("store-cart-total")).toBeNull();
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAccessibleDescription(
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
    ["en", "/en/lr-market/orders/"],
    ["es", "/lr-market/orders/"],
  ] as const)(
    "in %s, a placed order opens its page at %s and takes its articles out of the cart",
    async (locale, path) => {
      const { placeOrder, shown, storedCart } = setup({ locale });
      const create = vi.fn((_input: unknown) => ({ token: TOKEN }));
      server.use(createOrpcHandler("order.create", create));

      await shown();
      await placeOrder();

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
    }
  );

  test("a placed order takes out only what it ordered, keeping what another tab added while it was sent", async () => {
    const { placeOrder, shown, storedCart } = setup();
    const answer: { release: () => void } = { release: () => undefined };
    const create = vi.fn(
      async (_input: unknown) =>
        await new Promise<{ token: string }>((resolve) => {
          answer.release = () => {
            resolve({ token: TOKEN });
          };
        })
    );
    server.use(createOrpcHandler("order.create", create));

    await shown();
    await placeOrder();
    await waitFor(() => {
      expect(create).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          items: [
            { productId: 4, quantity: 2 },
            { productId: 9, quantity: 1 },
          ],
        })
      );
    });
    // Another tab raises article 4 and adds article 11 meanwhile.
    act(() => {
      localStorage.setItem(
        KEY,
        JSON.stringify([
          makeLine(4, 3, 40_000),
          makeLine(9, 1, 90_000),
          makeLine(11, 1),
        ])
      );
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });
    answer.release();

    await waitFor(() => {
      expect(push).toHaveBeenCalledExactlyOnceWith(
        `/en/lr-market/orders/${TOKEN}`
      );
    });
    expect(storedCart()).toEqual([makeLine(4, 1, 40_000), makeLine(11, 1)]);
  });

  test("a refresh that fails after an earlier answer keeps the lines, says so, holds the order, and reads again on retry", async () => {
    const { cartProducts, lines, shown, submit, user } = setup();
    await shown();
    server.use(
      createOrpcErrorHandler("catalog.cartProducts", {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
        status: 500,
      })
    );

    // Back to the tab: the prices are read again, and that read fails.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not fetch the current prices."
    );
    expect(lines()).toEqual([
      ["Artículo 4", null],
      ["Artículo 9", null],
    ]);
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAccessibleDescription(
      "We could not fetch the current prices."
    );

    server.use(createOrpcHandler("catalog.cartProducts", cartProducts));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(submit()).toBeEnabled();
    // The first answer and the retry; the failed read went to the error
    // handler in between.
    expect(cartProducts.mock.calls).toEqual([
      [{ ids: [4, 9], locale: "en", storeSlug: "lr-market" }],
      [{ ids: [4, 9], locale: "en", storeSlug: "lr-market" }],
    ]);
  });

  test.each([
    [
      "back to the tab",
      async (_user: User) => {
        act(() => {
          focusManager.setFocused(false);
          focusManager.setFocused(true);
        });
        await Promise.resolve();
      },
    ],
    [
      "an article that changed under the order",
      async (user: User) => {
        server.use(
          createOrpcErrorHandler("order.create", {
            code: "BAD_REQUEST",
            message: "Article not available",
            status: 400,
          })
        );
        await user.type(
          screen.getByRole("textbox", { name: "Your name" }),
          "Ana Pérez"
        );
        await user.type(
          screen.getByRole("textbox", { name: "Your mobile" }),
          "099 123 456"
        );
        await user.click(screen.getByTestId("store-checkout-submit"));
      },
    ],
  ])(
    "a refresh on its way after %s keeps the lines and holds the order until the shop answers",
    async (_case, refresh) => {
      const { cartProducts, lines, shown, submit, total, user } = setup();
      await shown();
      const answer = deferred<CartProduct[]>();
      cartProducts.mockImplementation(async () => await answer.promise);

      await refresh(user);

      await waitFor(() => {
        expect(submit()).toBeDisabled();
      });
      expect(submit()).toHaveAccessibleDescription(
        "Fetching the current prices…"
      );
      // The cached answer stays on screen meanwhile.
      expect(lines()).toEqual([
        ["Artículo 4", null],
        ["Artículo 9", null],
      ]);
      expect(total()).toBe("TotalUYU 1,700");
      expect(cartProducts).toHaveBeenLastCalledWith({
        ids: [4, 9],
        locale: "en",
        storeSlug: "lr-market",
      });

      await act(async () => {
        answer.resolve([
          makeProduct(4, { priceAmount: 50_000 }),
          makeProduct(9),
        ]);
        await answer.promise;
      });

      await waitFor(() => {
        expect(lines()).toEqual([
          ["Artículo 4", "price_changed"],
          ["Artículo 9", null],
        ]);
      });
      expect(total()).toBe("TotalUYU 1,900");
      expect(submit()).toBeEnabled();
      expect(submit()).not.toHaveAttribute("aria-describedby");
    }
  );

  test("an article added while its price loads is pending, not gone, and holds the order until it arrives", async () => {
    const { cartProducts, lines, shown, submit } = setup({
      cart: [makeLine(4, 2, 40_000)],
      products: [makeProduct(4)],
    });

    await shown();
    // The answer for the longer list never comes: the first one stays on
    // screen as placeholder data.
    cartProducts.mockImplementation(
      async () => await new Promise<never>(() => {})
    );
    act(() => {
      localStorage.setItem(
        KEY,
        JSON.stringify([makeLine(4, 2, 40_000), makeLine(11, 1)])
      );
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });

    await waitFor(() => {
      expect(lines()).toEqual([
        ["Artículo 4", null],
        ["Fetching the current prices…", "pending"],
      ]);
    });
    expect(cartProducts).toHaveBeenLastCalledWith({
      ids: [4, 11],
      locale: "en",
      storeSlug: "lr-market",
    });
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAccessibleDescription(
      "Fetching the current prices…"
    );
  });

  test("taking out a line moves focus to the remove button now in its place, and says what was taken out", async () => {
    const { announcement, shown, user } = setup({
      cart: [...CART, makeLine(12, 1, 120_000)],
      products: [makeProduct(4), makeProduct(9), makeProduct(12)],
    });

    await shown();
    await user.click(screen.getByRole("button", { name: "Remove Artículo 4" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove Artículo 9" })
      ).toHaveFocus();
    });
    expect(announcement()).toBe("You removed Artículo 4 from the cart.\u2060");
  });

  test("a read that fails after a line is taken out keeps what the shopper typed, and the order goes through after a retry", async () => {
    const { cartProducts, lines, shown, submit, user } = setup();
    const create = vi.fn((_input: unknown) => ({ token: TOKEN }));
    server.use(createOrpcHandler("order.create", create));
    await shown();
    await user.type(
      screen.getByRole("textbox", { name: "Your name" }),
      "Ana Pérez"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Your mobile" }),
      "099 123 456"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Note for the store (optional)" }),
      "Sin bolsa"
    );
    server.use(
      createOrpcErrorHandler("catalog.cartProducts", {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
        status: 500,
      })
    );

    await user.click(screen.getByRole("button", { name: "Remove Artículo 4" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not fetch the current prices."
    );
    expect(lines()).toEqual([["Fetching the current prices…", "pending"]]);
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveValue(
      "Ana Pérez"
    );
    expect(screen.getByRole("textbox", { name: "Your mobile" })).toHaveValue(
      "099 123 456"
    );
    expect(
      screen.getByRole("textbox", { name: "Note for the store (optional)" })
    ).toHaveValue("Sin bolsa");
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAccessibleDescription(
      "We could not fetch the current prices."
    );

    server.use(createOrpcHandler("catalog.cartProducts", cartProducts));
    cartProducts.mockResolvedValue([makeProduct(9)]);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(lines()).toEqual([["Artículo 9", null]]);
    });
    await waitFor(() => {
      expect(submit()).toBeEnabled();
    });
    await user.click(submit());

    await waitFor(() => {
      expect(push).toHaveBeenCalledExactlyOnceWith(
        `/en/lr-market/orders/${TOKEN}`
      );
    });
    expect(create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        customerName: "Ana Pérez",
        customerPhone: "099 123 456",
        items: [{ productId: 9, quantity: 1 }],
        note: "Sin bolsa",
      })
    );
    expect(cartProducts.mock.calls).toEqual([
      [{ ids: [4, 9], locale: "en", storeSlug: "lr-market" }],
      [{ ids: [9], locale: "en", storeSlug: "lr-market" }],
    ]);
  });

  test("offline after a failed first read, a shorter list that cannot be read yet holds the order", async () => {
    const { cartProducts, submit, user } = setup({ products: "fail" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not fetch the current prices."
    );
    await user.type(
      screen.getByRole("textbox", { name: "Your name" }),
      "Ana Pérez"
    );
    server.use(createOrpcHandler("catalog.cartProducts", cartProducts));
    // No connection: the read for the shorter list waits without starting.
    act(() => {
      onlineManager.setOnline(false);
    });
    const [first] = screen.getAllByRole("button", {
      name: "Remove Fetching the current prices…",
    });
    if (!first) {
      throw new Error("No line to remove");
    }

    await user.click(first);

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(cartProducts).not.toHaveBeenCalled();
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAccessibleDescription(
      "Fetching the current prices…"
    );
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveValue(
      "Ana Pérez"
    );
  });

  test("a line taken out after a failed first read keeps the form and what was typed while the shorter list loads", async () => {
    const { cartProducts, submit, user } = setup({ products: "fail" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not fetch the current prices."
    );
    await user.type(
      screen.getByRole("textbox", { name: "Your name" }),
      "Ana Pérez"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Your mobile" }),
      "099 123 456"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Note for the store (optional)" }),
      "Sin bolsa"
    );
    // The read for the shorter list never comes back.
    server.use(createOrpcHandler("catalog.cartProducts", cartProducts));
    cartProducts.mockImplementation(
      async () => await new Promise<never>(() => {})
    );
    const [first] = screen.getAllByRole("button", {
      name: "Remove Fetching the current prices…",
    });
    if (!first) {
      throw new Error("No line to remove");
    }

    await user.click(first);

    await waitFor(() => {
      expect(cartProducts).toHaveBeenCalledExactlyOnceWith({
        ids: [9],
        locale: "en",
        storeSlug: "lr-market",
      });
    });
    // The lines' place says the prices are on their way.
    const items = screen.getByRole("region", { name: "Your cart" });
    expect(within(items).getByRole("status")).toHaveTextContent(
      "Fetching the current prices…"
    );
    expect(screen.queryAllByTestId("store-cart-line")).toEqual([]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveValue(
      "Ana Pérez"
    );
    expect(screen.getByRole("textbox", { name: "Your mobile" })).toHaveValue(
      "099 123 456"
    );
    expect(
      screen.getByRole("textbox", { name: "Note for the store (optional)" })
    ).toHaveValue("Sin bolsa");
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAccessibleDescription(
      "Fetching the current prices…"
    );
  });

  test("taking out the last of several lines moves focus to the one before it", async () => {
    const { shown, user } = setup();

    await shown();
    await user.click(screen.getByRole("button", { name: "Remove Artículo 9" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove Artículo 4" })
      ).toHaveFocus();
    });
  });

  test.each([
    ["en", "Keep browsing", "You removed Artículo 4 from the cart.\u2060"],
    ["es", "Seguir mirando", "Quitaste Artículo 4 del carrito.\u2060"],
  ] as const)(
    "in %s, taking out the only line moves focus to %j and announces it",
    async (locale, link, said) => {
      const { announcement, shown, user } = setup({
        cart: [makeLine(4, 2, 40_000)],
        locale,
        products: [makeProduct(4)],
      });

      await shown();
      await user.click(
        screen.getByRole("button", {
          name: locale === "en" ? "Remove Artículo 4" : "Quitar Artículo 4",
        })
      );

      const empty = await screen.findByTestId("store-cart-empty");
      expect(within(empty).getByRole("link", { name: link })).toHaveFocus();
      expect(announcement()).toBe(said);
    }
  );

  test("the same message said twice flips its invisible mark, so it is announced again", async () => {
    const { announcement, lines, shown, user } = setup({ products: [] });

    await shown();
    expect(announcement()).toBe("");
    const [first] = screen.getAllByRole("button", {
      name: "Remove Article no longer for sale",
    });
    if (!first) {
      throw new Error("No line to remove");
    }
    await user.click(first);
    await waitFor(() => {
      expect(lines()).toEqual([["Article no longer for sale", "gone"]]);
    });
    expect(announcement()).toBe(
      "You removed Article no longer for sale from the cart.\u2060"
    );
    await user.click(screen.getByRole("button", { name: /^Remove /u }));

    await screen.findByTestId("store-cart-empty");
    expect(announcement()).toBe(
      "You removed Article no longer for sale from the cart."
    );
  });

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
