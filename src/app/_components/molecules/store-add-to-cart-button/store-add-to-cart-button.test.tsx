import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { StoreAddToCartButton } from "./store-add-to-cart-button";

const KEY = "feria:cart:lr-market";

/** `count` distinct articles, one unit each. */
function makeCart(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    productId: index + 1,
    quantity: 1,
  }));
}

function setup({
  cart = [],
  locale = "es",
}: { cart?: ReturnType<typeof makeCart>; locale?: Locale } = {}) {
  localStorage.setItem(KEY, JSON.stringify(cart));
  renderWithI18n(
    <StoreAddToCartButton
      className="custom"
      name="Collar de perlas"
      productId={42}
      storeSlug="lr-market"
    />,
    { locale }
  );

  return {
    status: () => screen.getByRole("status"),
    storedCart: (): unknown => JSON.parse(localStorage.getItem(KEY) ?? "null"),
    user: userEvent.setup(),
  };
}

afterEach(() => {
  localStorage.clear();
});

describe("StoreAddToCartButton", () => {
  test.each([
    ["es", "Agregar al carrito: Collar de perlas", "Agregar"],
    ["en", "Add to cart: Collar de perlas", "Add"],
  ] as const)("in %s, is named %j and reads %j", (locale, name, text) => {
    setup({ locale });

    const button = screen.getByRole("button", { name });
    expect(button).toHaveTextContent(new RegExp(`^${text}$`, "u"));
    expect(button).toHaveAttribute("type", "button");
  });

  test("starts with nothing said", () => {
    const { status } = setup();

    expect(status()).toHaveTextContent(/^$/u);
    expect(status()).toHaveAttribute("aria-live", "polite");
  });

  test("adds one of the article to the store's cart and says so", async () => {
    const { status, storedCart, user } = setup({ cart: makeCart(2) });

    await user.click(screen.getByRole("button"));

    expect(storedCart()).toEqual([
      ...makeCart(2),
      { productId: 42, quantity: 1 },
    ]);
    expect(status()).toHaveTextContent(/^Agregado al carrito\.$/u);
  });

  test("adds one more on a second click", async () => {
    const { storedCart, user } = setup();

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("button"));

    expect(storedCart()).toEqual([{ productId: 42, quantity: 2 }]);
  });

  test.each([
    ["es", "El carrito ya tiene 20 artículos distintos."],
    ["en", "The cart already holds 20 different articles."],
  ] as const)(
    "in %s, with 20 articles already in the cart, adds nothing and says %j",
    async (locale, message) => {
      const { status, storedCart, user } = setup({
        cart: makeCart(20),
        locale,
      });

      await user.click(screen.getByRole("button"));

      expect(storedCart()).toEqual(makeCart(20));
      expect(status().textContent).toBe(message);
    }
  );
});
