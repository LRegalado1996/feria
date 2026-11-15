import { screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { StoreCartButton } from "./store-cart-button";

/** A cart of these quantities, one article each. */
function makeCart(quantities: number[]) {
  return quantities.map((quantity, index) => ({
    productId: index + 1,
    quantity,
  }));
}

function setup({
  cart = [],
  locale = "en",
  storeSlug = "lr-market",
}: { cart?: number[]; locale?: Locale; storeSlug?: string } = {}) {
  localStorage.setItem(
    `feria:cart:${storeSlug}`,
    JSON.stringify(makeCart(cart))
  );
  renderWithI18n(<StoreCartButton className="custom" storeSlug={storeSlug} />, {
    locale,
  });

  return {
    badge: () => screen.queryByTestId("store-cart-count"),
    link: screen.getByTestId("store-cart-button"),
  };
}

afterEach(() => {
  localStorage.clear();
});

describe("StoreCartButton", () => {
  test.each([
    ["en", [], "Cart, empty"],
    ["en", [1], "Cart, 1 article"],
    ["en", [2], "Cart, 2 articles"],
    ["en", [1, 1], "Cart, 2 articles"],
    ["en", [3, 4], "Cart, 7 articles"],
    ["es", [], "Carrito, vacío"],
    ["es", [1], "Carrito, 1 artículo"],
    ["es", [2, 3], "Carrito, 5 artículos"],
  ] as const)(
    "in %s, with quantities %j, is named %j",
    (locale, cart, name) => {
      const { link } = setup({ cart: [...cart], locale });

      expect(screen.getByRole("link", { name })).toBe(link);
    }
  );

  test("shows no badge for an empty cart", () => {
    const { badge } = setup();

    expect(badge()).toBeNull();
  });

  test.each([
    [[1], "1"],
    [[3, 4], "7"],
  ])(
    "with quantities %j, its badge shows %s, hidden from screen readers",
    (cart, text) => {
      const { badge } = setup({ cart });

      expect(badge()).toHaveTextContent(new RegExp(`^${text}$`, "u"));
      expect(badge()).toHaveAttribute("aria-hidden", "true");
    }
  );

  test.each([
    ["es", "lr-market", "/lr-market/cart"],
    ["en", "lr-market", "/en/lr-market/cart"],
    ["en", "tienda-demo", "/en/tienda-demo/cart"],
  ] as const)("in %s, leads to %s's cart at %s", (locale, storeSlug, href) => {
    const { link } = setup({ locale, storeSlug });

    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("data-slot", "store-cart-button");
    expect(link).toHaveClass("custom");
  });

  test("counts only its own store's cart", () => {
    localStorage.setItem(
      "feria:cart:tienda-demo",
      JSON.stringify(makeCart([5]))
    );
    const { badge, link } = setup({ storeSlug: "lr-market" });

    expect(link).toHaveAccessibleName("Cart, empty");
    expect(badge()).toBeNull();
  });
});
