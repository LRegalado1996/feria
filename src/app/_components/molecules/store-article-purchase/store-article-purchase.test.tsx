import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, DICTIONARIES, renderWithI18n } from "@/test/i18n";

import { StoreArticlePurchase } from "./store-article-purchase";

const KEY = "feria:cart";
const MARK = "\u2060";
// The price the page shows, kept on the cart line it adds.
const PRICE = 125_000;

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
  productId = 42,
}: {
  cart?: { productId: number; quantity: number }[];
  locale?: Locale;
  productId?: number;
} = {}) {
  localStorage.setItem(KEY, JSON.stringify(cart));
  const copy = DICTIONARIES[locale].storefront.article;
  const user = userEvent.setup();
  renderWithI18n(
    <StoreArticlePurchase
      className="custom"
      priceAmount={PRICE}
      productId={productId}
    />,
    { locale }
  );
  const group = () => screen.getByRole("group", { name: copy.quantity });

  return {
    add: async () => {
      await user.click(screen.getByRole("button", { name: copy.addToCart }));
    },
    decrease: () =>
      within(group()).getByRole("button", { name: copy.decrease }),
    group,
    increase: () =>
      within(group()).getByRole("button", { name: copy.increase }),
    quantity: () => screen.getByTestId("store-article-quantity").textContent,
    /** What the message region says, without its invisible mark. */
    said: () => message()?.textContent?.replaceAll(MARK, ""),
    message,
    storedCart: (): unknown => JSON.parse(localStorage.getItem(KEY) ?? "null"),
    user,
  };
}

/** The live region under the button, not the quantity's. */
function message() {
  return screen
    .getAllByRole("status")
    .find((region) => region.dataset.testid !== "store-article-quantity");
}

afterEach(() => {
  localStorage.clear();
});

describe("StoreArticlePurchase", () => {
  test("asks for a quantity in a group named Cantidad, starting at 1", () => {
    const { decrease, increase, quantity } = setup();

    expect(screen.getByRole("group", { name: "Cantidad" }).tagName).toBe(
      "FIELDSET"
    );
    expect(quantity()).toBe("1");
    expect(decrease()).toBeDisabled();
    expect(increase()).toBeEnabled();
    expect(message()?.textContent).toBe("");
  });

  test("draws the quantity as a pill beside the page's one primary pill, on one row, the pill taking the rest", () => {
    const { decrease, group, increase } = setup();

    expect(group()).toHaveClass(
      "rounded-full",
      "border-2",
      "border-store-foreground",
      "h-13"
    );
    for (const step of [decrease(), increase()]) {
      expect(step).toHaveAttribute("data-slot", "store-button");
      expect(step).toHaveAttribute("data-size", "icon");
    }
    const add = screen.getByRole("button", { name: "Agregar al carrito" });
    expect(add).toHaveAttribute("data-variant", "primary");
    expect(add).toHaveAttribute("data-size", "lg");
    // Beside the quantity, on one row that never wraps: the button takes the
    // rest of it, and its label breaks inside it before the row would.
    expect(add).toHaveClass("flex-1", "min-w-0", "whitespace-normal");
    expect(add.parentElement).toBe(group().parentElement);
    expect(add.parentElement).toHaveAttribute(
      "data-testid",
      "store-article-purchase-row"
    );
    expect(add.parentElement).not.toHaveClass("flex-wrap");
    // The stepper gives up its padding first; its steps stay 44 px.
    expect(group()).not.toHaveClass("px-0.5");
  });

  test("steps the quantity up to 10 and back down to 1, no further either way", async () => {
    const { decrease, increase, quantity, user } = setup();

    for (let step = 0; step < 9; step += 1) {
      await user.click(increase());
    }

    expect(quantity()).toBe("10");
    expect(increase()).toBeDisabled();
    expect(decrease()).toBeEnabled();

    await user.click(decrease());
    expect(quantity()).toBe("9");
    expect(increase()).toBeEnabled();

    for (let step = 0; step < 7; step += 1) {
      await user.click(decrease());
    }

    expect(quantity()).toBe("2");
    expect(decrease()).toBeEnabled();

    await user.click(decrease());
    expect(quantity()).toBe("1");
    expect(decrease()).toBeDisabled();
  });

  test("adds the chosen quantity to the store's cart and says so", async () => {
    const { add, increase, said, storedCart, user } = setup({
      cart: makeCart(1),
    });

    await user.click(increase());
    await user.click(increase());
    await add();

    expect(storedCart()).toEqual([
      ...makeCart(1),
      { productId: 42, quantity: 3, seenPriceAmount: PRICE },
    ]);
    expect(said()).toBe("Agregado al carrito.");
  });

  test.each([
    [9, 3, "Agregamos 1: con ellos tenés 10, el máximo por pedido."],
    [7, 4, "Agregamos 3: con ellos tenés 10, el máximo por pedido."],
  ])(
    "with %i in the cart, choosing %i fills it to 10 and says how many it took",
    async (had, chosen, text) => {
      const { add, increase, said, storedCart, user } = setup({
        cart: [{ productId: 42, quantity: had }],
      });

      for (let step = 1; step < chosen; step += 1) {
        await user.click(increase());
      }
      await add();

      expect(storedCart()).toEqual([
        { productId: 42, quantity: 10, seenPriceAmount: PRICE },
      ]);
      expect(said()).toBe(text);
    }
  );

  test("with 7 in the cart, choosing 3 fits exactly and says it was added", async () => {
    const { add, increase, said, storedCart, user } = setup({
      cart: [{ productId: 42, quantity: 7 }],
    });

    await user.click(increase());
    await user.click(increase());
    await add();

    expect(storedCart()).toEqual([
      { productId: 42, quantity: 10, seenPriceAmount: PRICE },
    ]);
    expect(said()).toBe("Agregado al carrito.");
  });

  test("a repeated message is announced again: the mark flips", async () => {
    const { add, message: region, storedCart } = setup();

    await add();
    const first = region()?.textContent;
    await add();

    expect(storedCart()).toEqual([
      { productId: 42, quantity: 2, seenPriceAmount: PRICE },
    ]);
    expect([first, region()?.textContent]).toEqual([
      `Agregado al carrito.${MARK}`,
      "Agregado al carrito.",
    ]);
  });

  test.each([
    [
      "an article already at 10",
      { cart: [{ productId: 42, quantity: 10 }] },
      "Ya tenés 10 de este artículo, el máximo por pedido.",
      [{ productId: 42, quantity: 10 }],
    ],
    [
      "a cart of 20 articles",
      { cart: makeCart(20) },
      "El carrito ya tiene 20 artículos distintos, el máximo.",
      makeCart(20),
    ],
    [
      "an article the cart cannot hold",
      { productId: 0 },
      "No pudimos agregarlo. Probá de nuevo.",
      [],
    ],
  ] as const)(
    "with %s, adds nothing and says so",
    async (_case, options, text, cart) => {
      const { add, said, storedCart } = setup({
        cart: "cart" in options ? [...options.cart] : [],
        productId: "productId" in options ? options.productId : 42,
      });

      await add();

      expect(storedCart()).toEqual(cart);
      expect(said()).toBe(text);
    }
  );

  test.each([
    ["es", "Cantidad", "Una unidad menos", "Agregado al carrito."],
    ["en", "Quantity", "One unit less", "Added to cart."],
  ] as const)(
    "in %s, names the group %j and the step %j, and says %j",
    async (locale, legend, decreaseName, text) => {
      const { add, decrease, group, said } = setup({ locale });

      expect(group()).toHaveAccessibleName(legend);
      expect(decrease()).toHaveAccessibleName(decreaseName);
      await add();

      expect(said()).toBe(text);
    }
  );
});

describe("StoreArticlePurchase before hydration", () => {
  test("its add button is disabled in the server's HTML and enabled once React owns it", () => {
    const I18n = createI18nWrapper("es");
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <I18n>
        <StoreArticlePurchase priceAmount={PRICE} productId={42} />
      </I18n>,
      { clientNowMs: 1000, serverNowMs: 0 }
    );
    const addIn = (html: string) => {
      const container = document.createElement("div");
      container.innerHTML = html;
      return [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Agregar al carrito"
      );
    };

    expect(addIn(serverHtml)).toHaveProperty("disabled", true);
    expect(addIn(clientHtml)).toHaveProperty("disabled", false);
    expect(errors).toEqual([]);
  });
});
