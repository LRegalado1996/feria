import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { CartPanelContext, type CartPanelOptions } from "@/lib/hooks/cart";
import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";

import { StoreSpotlightButton } from "./store-spotlight-button";

const KEY = "feria:cart";
const MARK = "⁠";

function setup({
  cart = [],
  locale = "en",
  panel = true,
}: {
  cart?: { productId: number; quantity: number }[];
  locale?: Locale;
  /** Inside a store page's frame, whose cart panel adding opens. */
  panel?: boolean;
} = {}) {
  localStorage.setItem(KEY, JSON.stringify(cart));
  const user = userEvent.setup();
  const open = vi.fn<(options?: CartPanelOptions) => void>();
  const button = (
    <StoreSpotlightButton
      className="custom"
      priceAmount={79_000}
      productId={6}
      title="Fish bubble gun"
    />
  );
  renderWithI18n(
    panel ? (
      <CartPanelContext value={{ isOpen: false, open }}>
        {button}
      </CartPanelContext>
    ) : (
      button
    ),
    { locale }
  );

  return {
    add: async (name = "Add to cart: Fish bubble gun") => {
      await user.click(screen.getByRole("button", { name }));
    },
    open,
    /** What the live region under the button says, without its mark. */
    said: () => screen.getByRole("status").textContent?.replaceAll(MARK, ""),
    stored: (): unknown => JSON.parse(localStorage.getItem(KEY) ?? "null"),
  };
}

describe("StoreSpotlightButton", () => {
  test("adds one unit at the price shown and opens the cart's panel on its line, focus to return to it", async () => {
    const { add, open, said, stored } = setup();

    await add();

    expect(stored()).toEqual([
      { productId: 6, quantity: 1, seenPriceAmount: 79_000 },
    ]);
    expect(open).toHaveBeenCalledExactlyOnceWith({
      added: {
        message: "You added Fish bubble gun to your cart.",
        productId: 6,
      },
      returnFocus: screen.getByRole("button", {
        name: "Add to cart: Fish bubble gun",
      }),
    });
    // Said in the panel: nothing under the button.
    expect(said()).toBe("");
  });

  test("what adding could not do is said under it, again on a second press", async () => {
    const { add, open, said } = setup({
      cart: [{ productId: 6, quantity: 10 }],
    });

    await add();
    expect(said()).toBe(
      "You already have 10 of this article, the most an order takes."
    );
    await add();

    expect(said()).toBe(
      "You already have 10 of this article, the most an order takes."
    );
    expect(open).not.toHaveBeenCalled();
  });

  test("outside a store page's frame, says it under the button", async () => {
    const { add, said } = setup({ panel: false });

    await add();

    expect(said()).toBe("Added to cart.");
  });

  test("its name starts with the words it shows, in Spanish too", async () => {
    const { add, stored } = setup({ locale: "es" });

    await add("Agregar al carrito: Fish bubble gun");

    expect(stored()).toEqual([
      { productId: 6, quantity: 1, seenPriceAmount: 79_000 },
    ]);
    expect(
      screen.getByRole("button", {
        name: "Agregar al carrito: Fish bubble gun",
      })
    ).toHaveTextContent("Agregar al carrito");
  });

  test("is disabled in the server's HTML and enabled once React owns it", () => {
    const I18n = createI18nWrapper("es");
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <I18n>
        <StoreSpotlightButton
          priceAmount={79_000}
          productId={6}
          title="Burbujero pez"
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
