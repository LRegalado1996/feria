import { focusManager, onlineManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCartLines } from "./use-cart-lines";
import type { CartProduct } from "./use-cart-products";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// The app's client reports a failed query; that has its own tests.
vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const KEY = "feria:cart";

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

/**
 * Renders the hook over a stored cart. The shop answers the ids it is
 * asked for, from `products`, or fails, or keeps the answer while `held`.
 */
function setup({
  cart = [makeLine(4, 2, 40_000), makeLine(9, 1, 90_000)],
  products = [makeProduct(4), makeProduct(9)],
}: {
  cart?: unknown[];
  products?: "fail" | "hang" | CartProduct[];
} = {}) {
  localStorage.setItem(KEY, JSON.stringify(cart));
  const cartProducts = vi.fn(async (input: unknown) => {
    if (products === "hang") {
      return await new Promise<never>(() => {});
    }

    const ids =
      typeof input === "object" && input !== null && "ids" in input
        ? input.ids
        : [];

    return Array.isArray(ids) && Array.isArray(products)
      ? products.filter((product) => ids.includes(product.id))
      : [];
  });
  server.use(
    products === "fail"
      ? createOrpcErrorHandler("catalog.cartProducts", {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
          status: 500,
        })
      : createOrpcHandler("catalog.cartProducts", cartProducts)
  );
  const { result } = renderHook(() => useCartLines("en"), {
    wrapper: createQueryWrapper(),
  });

  return {
    cartProducts,
    /** The lines as `[id, flag, has its article]`. */
    lines: () =>
      result.current.lines.map(({ flag, item, product }) => [
        item.productId,
        flag,
        product?.id ?? null,
      ]),
    result,
    /** The cart changes, as the panel or another tab changes it. */
    store: (next: unknown[]) => {
      act(() => {
        localStorage.setItem(KEY, JSON.stringify(next));
        window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
      });
    },
  };
}

afterEach(() => {
  localStorage.clear();
  onlineManager.setOnline(true);
  focusManager.setFocused(undefined);
});

describe("useCartLines", () => {
  test("an empty cart is empty, and asks the shop nothing", () => {
    const { cartProducts, result } = setup({ cart: [] });

    expect(result.current.status).toBe("empty");
    expect(result.current.count).toBe(0);
    expect(result.current.total).toBeNull();
    expect(cartProducts).not.toHaveBeenCalled();
  });

  test("before the shop's first answer, waits: every line pending, the order held", () => {
    const { lines, result } = setup({ products: "hang" });

    expect(result.current.status).toBe("waiting");
    expect(lines()).toEqual([
      [4, "pending", null],
      [9, "pending", null],
    ]);
    expect(result.current.hold).toBe("loading");
    expect(result.current.loadingLines).toBe(true);
    expect(result.current.total).toBeNull();
    expect(result.current.count).toBe(3);
  });

  test("with the shop's answer, each line has its article, and the total is what can be bought", async () => {
    const { lines, result } = setup();

    await waitFor(() => {
      expect(result.current.hold).toBeNull();
    });
    expect(result.current.status).toBe("shown");
    expect(lines()).toEqual([
      [4, null, 4],
      [9, null, 9],
    ]);
    // 2 × 400 + 1 × 900.
    expect(result.current.total).toEqual({ amount: 170_000, currency: "UYU" });
  });

  test("the total is in the currency the shop prices in", async () => {
    const { result } = setup({
      cart: [makeLine(4, 1)],
      products: [makeProduct(4, { currencyCode: "USD" })],
    });

    await waitFor(() => {
      expect(result.current.total).toEqual({ amount: 40_000, currency: "USD" });
    });
  });

  test.each([
    [
      "a price that changed",
      [makeProduct(4, { priceAmount: 50_000 }), makeProduct(9)],
      [
        [4, "price_changed", 4],
        [9, null, 9],
      ],
      null,
      { amount: 190_000, currency: "UYU" },
    ],
    [
      "a sold-out article",
      [makeProduct(4), makeProduct(9, { isAvailable: false })],
      [
        [4, null, 4],
        [9, "unavailable", 9],
      ],
      "blocked",
      { amount: 80_000, currency: "UYU" },
    ],
    [
      "an article the shop no longer has",
      [makeProduct(4)],
      [
        [4, null, 4],
        [9, "gone", null],
      ],
      "blocked",
      { amount: 80_000, currency: "UYU" },
    ],
    [
      "no article left",
      [],
      [
        [4, "gone", null],
        [9, "gone", null],
      ],
      "blocked",
      null,
    ],
  ] as const)(
    "with %s, flags its line and the order's hold follows",
    async (_case, products, flags, hold, total) => {
      const { lines, result } = setup({ products: [...products] });

      await waitFor(() => {
        expect(result.current.status).toBe("shown");
      });
      await waitFor(() => {
        expect(lines()).toEqual(flags);
      });
      expect(result.current.hold).toBe(hold);
      expect(result.current.total).toEqual(total);
    }
  );

  test("a line added without the price seen is never flagged as changed", async () => {
    const { lines, result } = setup({
      cart: [makeLine(4, 1)],
      products: [makeProduct(4, { priceAmount: 1 })],
    });

    await waitFor(() => {
      expect(result.current.hold).toBeNull();
    });
    expect(lines()).toEqual([[4, null, 4]]);
  });

  test("a failed read is laid out all the same: the lines wait, the order holds for a new read", async () => {
    const { lines, result } = setup({ products: "fail" });

    await waitFor(() => {
      expect(result.current.failed).toBe(true);
    });
    expect(result.current.status).toBe("shown");
    expect(result.current.hold).toBe("refresh");
    expect(result.current.loadingLines).toBe(false);
    expect(lines()).toEqual([
      [4, "pending", null],
      [9, "pending", null],
    ]);
  });

  test("once laid out, a shorter list with nothing to keep meanwhile stays laid out, waiting", async () => {
    const { cartProducts, lines, result, store } = setup({ products: "fail" });
    await waitFor(() => {
      expect(result.current.failed).toBe(true);
    });
    server.use(createOrpcHandler("catalog.cartProducts", cartProducts));
    cartProducts.mockImplementation(
      async () => await new Promise<never>(() => {})
    );

    store([makeLine(9, 1, 90_000)]);

    await waitFor(() => {
      expect(result.current.failed).toBe(false);
    });
    expect(result.current.status).toBe("shown");
    expect(result.current.loadingLines).toBe(true);
    expect(result.current.hold).toBe("loading");
    expect(lines()).toEqual([[9, "pending", null]]);
  });

  test("offline, an article added keeps the others as the shop last said, and the order holds though nothing is being read", async () => {
    const { cartProducts, lines, result, store } = setup({
      cart: [makeLine(4, 2, 40_000)],
    });
    await waitFor(() => {
      expect(result.current.hold).toBeNull();
    });
    // No connection: the read for the longer list waits without starting.
    act(() => {
      onlineManager.setOnline(false);
    });

    store([makeLine(4, 2, 40_000), makeLine(11, 1)]);

    await waitFor(() => {
      expect(lines()).toEqual([
        [4, null, 4],
        [11, "pending", null],
      ]);
    });
    expect(cartProducts.mock.calls).toEqual([[{ ids: [4], locale: "en" }]]);
    expect(result.current.hold).toBe("loading");
  });

  test("offline, back to the tab, the order holds while the shop's word on the same list waits to be read", async () => {
    const { cartProducts, lines, result } = setup({
      cart: [makeLine(4, 2, 40_000)],
    });
    await waitFor(() => {
      expect(result.current.hold).toBeNull();
    });
    act(() => {
      onlineManager.setOnline(false);
    });

    // The tab is left and come back to: the read again waits for a
    // connection, with this list's own answer still on screen.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => {
      expect(result.current.hold).toBe("loading");
    });
    expect(lines()).toEqual([[4, null, 4]]);
    expect(cartProducts.mock.calls).toEqual([[{ ids: [4], locale: "en" }]]);
  });

  test("an article added keeps the others as the shop last said and holds the order until its own answer", async () => {
    const { cartProducts, lines, result, store } = setup({
      cart: [makeLine(4, 2, 40_000)],
    });
    await waitFor(() => {
      expect(result.current.hold).toBeNull();
    });
    cartProducts.mockImplementation(
      async () => await new Promise<never>(() => {})
    );

    store([makeLine(4, 2, 40_000), makeLine(11, 1)]);

    await waitFor(() => {
      expect(lines()).toEqual([
        [4, null, 4],
        [11, "pending", null],
      ]);
    });
    expect(result.current.hold).toBe("loading");
    expect(result.current.total).toEqual({ amount: 80_000, currency: "UYU" });
  });
});
