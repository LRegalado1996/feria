import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createI18nWrapper } from "@/test/i18n";

import { useAddToCart } from "./use-add-to-cart";
import { CartPanelContext, type CartPanelControls } from "./use-cart-panel";

const KEY = "feria:cart";

/** `count` distinct articles, one unit each. */
function makeCart(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    productId: index + 1,
    quantity: 1,
  }));
}

/**
 * The hook with the browser's cart holding `cart`, inside a store page's
 * frame (its side panel) or outside one.
 */
function setup({
  cart = [],
  inFrame = true,
  locale = "en",
}: {
  cart?: { productId: number; quantity: number }[];
  inFrame?: boolean;
  locale?: Locale;
} = {}) {
  localStorage.setItem(KEY, JSON.stringify(cart));
  const controls: CartPanelControls = {
    isOpen: false,
    open: vi.fn<CartPanelControls["open"]>(),
  };
  const I18n = createI18nWrapper(locale);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18n>
        {inFrame ? (
          <CartPanelContext value={controls}>{children}</CartPanelContext>
        ) : (
          children
        )}
      </I18n>
    );
  }

  const { result } = renderHook(() => useAddToCart(), { wrapper: Wrapper });
  const button = document.createElement("button");

  return {
    add: (productId: number, quantity = 1) =>
      result.current({
        priceAmount: 79_000,
        productId,
        quantity,
        returnFocus: button,
        title: "Fish bubble gun",
      }),
    button,
    open: controls.open,
    stored: (): unknown => JSON.parse(localStorage.getItem(KEY) ?? "null"),
  };
}

describe("useAddToCart", () => {
  test("adds to the browser's cart and opens the panel, which says it, saying nothing beside the button", () => {
    const { add, button, open, stored } = setup();

    expect(add(42, 2)).toBe("");

    expect(stored()).toEqual([
      { productId: 42, quantity: 2, seenPriceAmount: 79_000 },
    ]);
    expect(open).toHaveBeenCalledExactlyOnceWith({
      added: {
        message: "You added Fish bubble gun to your cart.",
        productId: 42,
      },
      returnFocus: button,
    });
  });

  test("in Spanish, the panel says it in Spanish", () => {
    const { add, open } = setup({ locale: "es" });

    add(42);

    expect(open).toHaveBeenCalledExactlyOnceWith({
      added: {
        message: "Agregaste Fish bubble gun al carrito.",
        productId: 42,
      },
      returnFocus: expect.any(HTMLButtonElement),
    });
  });

  test("taking fewer than chosen, the panel says how many it took", () => {
    const { add, open } = setup({ cart: [{ productId: 42, quantity: 9 }] });

    add(42, 3);

    expect(open).toHaveBeenCalledExactlyOnceWith({
      added: {
        message: "Added 1: with them you have 10, the most an order takes.",
        productId: 42,
      },
      returnFocus: expect.any(HTMLButtonElement),
    });
  });

  test("outside a store page's frame, says what it did beside the button", () => {
    const { add, stored } = setup({ inFrame: false });

    expect(add(42)).toBe("Added to cart.");
    expect(stored()).toEqual([
      { productId: 42, quantity: 1, seenPriceAmount: 79_000 },
    ]);
  });

  test.each([
    [
      "the cap of one article",
      [{ productId: 42, quantity: 10 }],
      "You already have 10 of this article, the most an order takes.",
    ],
    [
      "a full cart",
      makeCart(20),
      "The cart already holds 20 different articles, the most it takes.",
    ],
  ])(
    "at %s, opens no panel and says why beside the button",
    (_case, cart, said) => {
      const { add, open } = setup({ cart });

      expect(add(42)).toBe(said);
      expect(open).not.toHaveBeenCalled();
    }
  );
});
