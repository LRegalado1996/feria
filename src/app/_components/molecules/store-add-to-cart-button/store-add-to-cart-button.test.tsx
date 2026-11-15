import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";

import { StoreAddToCartButton } from "./store-add-to-cart-button";

const KEY = "feria:cart:lr-market";

/** `count` distinct articles, one unit each. */
function makeCart(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    productId: index + 1,
    quantity: 1,
  }));
}

const MARK = "\u2060";

function setup({
  cart = [],
  locale = "es",
  productId = 42,
}: {
  cart?: { productId: number; quantity: number }[];
  locale?: Locale;
  productId?: number;
} = {}) {
  localStorage.setItem(KEY, JSON.stringify(cart));
  renderWithI18n(
    <StoreAddToCartButton
      className="custom"
      name="Collar de perlas"
      productId={productId}
      storeSlug="lr-market"
    />,
    { locale }
  );

  return {
    status: () => screen.getByRole("status"),
    /** What the live region says, without its invisible mark. */
    said: () => screen.getByRole("status").textContent?.replaceAll(MARK, ""),
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
    const { said, storedCart, user } = setup({ cart: makeCart(2) });

    await user.click(screen.getByRole("button"));

    expect(storedCart()).toEqual([
      ...makeCart(2),
      { productId: 42, quantity: 1 },
    ]);
    expect(said()).toBe("Agregado al carrito.");
  });

  test("adds one more on a second click, and says it again as news", async () => {
    const { status, storedCart, user } = setup();

    await user.click(screen.getByRole("button"));
    const first = status().textContent;
    await user.click(screen.getByRole("button"));

    expect(storedCart()).toEqual([{ productId: 42, quantity: 2 }]);
    // The same words with the mark flipped: a screen reader hears it again.
    expect([first, status().textContent]).toEqual([
      `Agregado al carrito.${MARK}`,
      "Agregado al carrito.",
    ]);
  });

  test.each([
    [
      "es",
      "an article already at 10",
      { cart: [{ productId: 42, quantity: 10 }] },
      "Ya tenés 10 de este artículo, el máximo por pedido.",
      [{ productId: 42, quantity: 10 }],
    ],
    [
      "en",
      "an article already at 10",
      { cart: [{ productId: 42, quantity: 10 }] },
      "You already have 10 of this article, the most an order takes.",
      [{ productId: 42, quantity: 10 }],
    ],
    [
      "es",
      "a cart of 20 articles",
      { cart: makeCart(20) },
      "El carrito ya tiene 20 artículos distintos, el máximo.",
      makeCart(20),
    ],
    [
      "en",
      "a cart of 20 articles",
      { cart: makeCart(20) },
      "The cart already holds 20 different articles, the most it takes.",
      makeCart(20),
    ],
    [
      "es",
      "an article the cart cannot hold",
      { productId: 0 },
      "No pudimos agregarlo. Probá de nuevo.",
      [],
    ],
    [
      "en",
      "an article the cart cannot hold",
      { productId: 0 },
      "We could not add it. Try again.",
      [],
    ],
  ] as const)(
    "in %s, with %s, adds nothing and says so",
    async (locale, _case, options, message, cart) => {
      const { said, storedCart, user } = setup({
        cart: "cart" in options ? [...options.cart] : [],
        locale,
        productId: "productId" in options ? options.productId : 42,
      });

      await user.click(screen.getByRole("button"));

      expect(storedCart()).toEqual(cart);
      expect(said()).toBe(message);
    }
  );
});

describe("StoreAddToCartButton before hydration", () => {
  test("is disabled in the server's HTML and enabled once React owns it", () => {
    const I18n = createI18nWrapper("es");
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <I18n>
        <StoreAddToCartButton
          name="Collar de perlas"
          productId={42}
          storeSlug="lr-market"
        />
      </I18n>,
      { clientNowMs: 1000, serverNowMs: 0 }
    );
    const buttonIn = (html: string) => {
      const container = document.createElement("div");
      container.innerHTML = html;
      return container.querySelector("button");
    };

    expect(buttonIn(serverHtml)).toHaveProperty("disabled", true);
    expect(buttonIn(clientHtml)).toHaveProperty("disabled", false);
    expect(errors).toEqual([]);
  });
});
