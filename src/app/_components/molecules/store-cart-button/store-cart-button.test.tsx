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
}: { cart?: number[]; locale?: Locale } = {}) {
  localStorage.setItem("feria:cart", JSON.stringify(makeCart(cart)));
  renderWithI18n(<StoreCartButton className="custom" />, {
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
    ["en", [1], "Cart, 1 item"],
    ["en", [2], "Cart, 2 items"],
    ["en", [1, 1], "Cart, 2 items"],
    ["en", [3, 4], "Cart, 7 items"],
    ["es", [], "Carrito, vacío"],
    ["es", [1], "Carrito, 1 unidad"],
    ["es", [2, 3], "Carrito, 5 unidades"],
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
    ["es", "/cart"],
    ["en", "/en/cart"],
  ] as const)("in %s, leads to the cart at %s", (locale, href) => {
    const { link } = setup({ locale });

    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("data-slot", "store-cart-button");
    expect(link).toHaveClass("custom");
  });

  test("is a round accent icon on the header's moss, its count a round accent badge", () => {
    const { badge, link } = setup({ cart: [2] });

    expect(link).toHaveClass(
      "size-11",
      "rounded-full",
      "text-store-accent",
      "focus-visible:outline-store-accent"
    );
    expect(badge()).toHaveClass(
      "rounded-full",
      "bg-store-accent",
      "text-store-foreground"
    );
  });
});
