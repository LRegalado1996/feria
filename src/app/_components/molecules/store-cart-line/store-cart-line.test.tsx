import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { CartLineFlag, CartProduct } from "@/lib/hooks/cart";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { StoreCartLine } from "./store-cart-line";

function makeProduct(overrides: Partial<CartProduct> = {}): CartProduct {
  return {
    categorySlug: null,
    cover: {
      alt: "Collar de perlas sobre lino",
      height: 500,
      url: "/collar.jpg",
      width: 400,
    },
    currencyCode: "UYU",
    id: 4,
    isAvailable: true,
    lang: "es",
    priceAmount: 125_000,
    slug: "collar-de-perlas",
    title: "Collar de perlas",
    ...overrides,
  };
}

interface SetupOptions {
  flag?: CartLineFlag | null;
  justAdded?: boolean;
  locale?: Locale;
  product?: CartProduct | null;
  quantity?: number;
  seenPriceAmount?: number;
  variant?: "panel" | "summary";
}

function setup({
  flag = null,
  justAdded,
  locale = "en",
  product = makeProduct(),
  quantity = 2,
  seenPriceAmount,
  variant = "panel",
}: SetupOptions = {}) {
  const onQuantity = vi.fn((_quantity: number) => undefined);
  const lineOf = (props: Required<Pick<SetupOptions, "flag" | "product">>) => (
    <ul>
      {variant === "summary" ? (
        <StoreCartLine
          className="custom"
          flag={props.flag}
          product={props.product}
          quantity={quantity}
          seenPriceAmount={seenPriceAmount}
          variant="summary"
        />
      ) : (
        <StoreCartLine
          className="custom"
          flag={props.flag}
          justAdded={justAdded}
          onQuantity={onQuantity}
          product={props.product}
          quantity={quantity}
          seenPriceAmount={seenPriceAmount}
        />
      )}
    </ul>
  );
  const { rerender } = renderWithI18n(lineOf({ flag, product }), { locale });

  return {
    line: () => screen.getByTestId("store-cart-line"),
    notice: () => screen.getByTestId("store-cart-line-notice"),
    onQuantity,
    /** Renders the same line again, as the cart does after a refresh. */
    refresh: (props: Required<Pick<SetupOptions, "flag" | "product">>) => {
      rerender(lineOf(props));
    },
    user: userEvent.setup(),
  };
}

describe("StoreCartLine", () => {
  test("shows the article as the shop has it now, with its unit price and quantity", () => {
    const { line } = setup();

    expect(line()).toHaveClass("custom");
    expect(line()).not.toHaveAttribute("data-flag");
    expect(
      screen.getByRole("link", { name: "Collar de perlas" })
    ).toHaveAttribute("lang", "es");
    expect(line()).toHaveTextContent(`UYU 1,250 each`);
    expect(screen.getByTestId("store-cart-quantity")).toHaveTextContent(/^2$/u);
    expect(
      screen.getByRole("group", { name: "Quantity of Collar de perlas" })
    ).toBeVisible();
    // The photo is decoration: the name next to it says what it is.
    expect(line().querySelector("img")).toHaveAttribute("alt", "");
  });

  test("sets the photo on the grey tile, the name in the display face and the quantity in a pill", () => {
    const { line } = setup();

    expect(
      line().querySelector('[data-slot="store-cart-line-tile"]')
    ).toHaveClass("size-24", "bg-store-surface");
    expect(screen.getByRole("link", { name: "Collar de perlas" })).toHaveClass(
      "font-display",
      "font-extrabold",
      "uppercase"
    );
    expect(
      screen.getByRole("group", { name: "Quantity of Collar de perlas" })
    ).toHaveClass("rounded-full", "border-2", "border-store-foreground");
    // The steps and the remove are the store's round buttons.
    for (const name of [
      "One unit less of Collar de perlas",
      "One unit more of Collar de perlas",
      "Remove Collar de perlas",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("data-slot", "store-button");
      expect(button).toHaveAttribute("data-size", "icon");
      expect(button).toHaveAttribute("type", "button");
    }
  });

  test("names a line with no article in the display face, muted", () => {
    setup({ flag: "gone", product: null });

    expect(screen.getByText("Article no longer for sale")).toHaveClass(
      "font-display",
      "text-store-muted"
    );
  });

  test.each([
    ["en", "/en/productos/collar-de-perlas"],
    ["es", "/productos/collar-de-perlas"],
  ] as const)("in %s, links to the article at %s", (locale, href) => {
    setup({ locale });

    expect(
      screen.getByRole("link", { name: "Collar de perlas" })
    ).toHaveAttribute("href", href);
  });

  test.each([
    ["en", `The price changed: it was UYU 1,000.`, `UYU 1,250 each`],
    ["es", `El precio cambió: antes $ 1.000.`, `$ 1.250 c/u`],
  ] as const)(
    "in %s, says the price changed and what it was",
    (locale, notice, unitPrice) => {
      const { line } = setup({
        flag: "price_changed",
        locale,
        seenPriceAmount: 100_000,
      });

      expect(line()).toHaveAttribute("data-flag", "price_changed");
      expect(screen.getByText(notice)).toBeVisible();
      expect(line()).toHaveTextContent(unitPrice);
      expect(screen.getAllByRole("button")).toHaveLength(3);
    }
  );

  test("says nothing about a price change without the price seen", () => {
    const { line } = setup({ flag: "price_changed" });

    expect(line().textContent?.replaceAll("\u00A0", " ")).toBe(
      "Collar de perlasUYU 1,250 eachQuantity of Collar de perlasOne unit less of Collar de perlas2One unit more of Collar de perlasRemove Collar de perlas"
    );
  });

  test.each([
    ["en", "Sold out for now."],
    ["es", "Agotado por ahora."],
  ] as const)(
    "in %s, a sold-out line says %j and can only be taken out",
    (locale, notice) => {
      const { line } = setup({
        flag: "unavailable",
        locale,
        product: makeProduct({ isAvailable: false }),
      });

      expect(line()).toHaveAttribute("data-flag", "unavailable");
      expect(screen.getByText(notice)).toBeVisible();
      // No price for what cannot be bought, and no quantity to change.
      expect(line()).not.toHaveTextContent(/1[.,]250/u);
      expect(screen.queryByRole("group")).toBeNull();
      expect(
        screen.getAllByRole("button").map((button) => button.textContent)
      ).toEqual([
        locale === "en" ? "Remove Collar de perlas" : "Quitar Collar de perlas",
      ]);
    }
  );

  test.each([
    ["en", "gone", "Article no longer for sale"],
    ["es", "gone", "Artículo que ya no está a la venta"],
    ["en", "pending", "Fetching the current prices…"],
    ["es", "pending", "Trayendo los precios de ahora…"],
  ] as const)(
    "in %s, a %s line with no article is named %j, with no link, photo, stepper or notice",
    (locale, flag, title) => {
      const { line } = setup({ flag, locale, product: null });

      expect(line()).toHaveAttribute("data-flag", flag);
      expect(line().querySelector("svg.lucide-circle-alert")).toBeNull();
      // Said once, as its name, not again as a notice.
      expect(line()).toHaveTextContent(
        new RegExp(
          `^${title}${locale === "en" ? "Remove" : "Quitar"} ${title}$`,
          "u"
        )
      );
      expect(screen.queryByRole("link")).toBeNull();
      expect(line().querySelector("img")).toBeNull();
      expect(screen.queryByRole("group")).toBeNull();
    }
  );

  test.each([
    [
      "sold out",
      "unavailable",
      makeProduct({ isAvailable: false }),
      "Sold out for now.",
    ],
    [
      "at a new price",
      "price_changed",
      makeProduct({ priceAmount: 150_000 }),
      "The price changed: it was UYU 1,250.",
    ],
  ] as const)(
    "a refresh that finds the line %s announces it in the region that was already there",
    (_case, flag, product, notice) => {
      const { notice: region, refresh } = setup({ seenPriceAmount: 125_000 });
      const before = region();

      expect(before).toHaveAttribute("aria-live", "polite");
      expect(before).toHaveTextContent(/^$/u);
      // Empty, it is out of the column's flow, so it adds no gap.
      expect(before).toHaveAttribute("class", "sr-only");

      refresh({ flag, product });

      expect(region()).toBe(before);
      expect(region()).toHaveTextContent(new RegExp(`^${notice}$`, "u"));
      expect(region()).not.toHaveClass("sr-only");
    }
  );

  test("an article with no photo shows the placeholder", () => {
    const { line } = setup({ product: makeProduct({ cover: null }) });

    expect(line().querySelector("img")).toBeNull();
    expect(line().querySelector("svg.lucide-image-off")).not.toBeNull();
  });

  test.each([
    ["one less", "One unit less of Collar de perlas", 5, 4],
    ["one more", "One unit more of Collar de perlas", 5, 6],
    ["one less from 2", "One unit less of Collar de perlas", 2, 1],
    ["one more from 9", "One unit more of Collar de perlas", 9, 10],
  ])("asks for %s", async (_case, name, quantity, expected) => {
    const { onQuantity, user } = setup({ quantity });

    await user.click(screen.getByRole("button", { name }));

    expect(onQuantity).toHaveBeenCalledExactlyOnceWith(expected);
  });

  test.each([
    [1, "true", "false"],
    [2, "false", "false"],
    [9, "false", "false"],
    [10, "false", "true"],
  ])(
    "at %i, the steppers' aria-disabled read less %s and more %s",
    (quantity, less, more) => {
      setup({ quantity });

      expect(
        screen.getByRole("button", {
          name: "One unit less of Collar de perlas",
        })
      ).toHaveAttribute("aria-disabled", less);
      expect(
        screen.getByRole("button", {
          name: "One unit more of Collar de perlas",
        })
      ).toHaveAttribute("aria-disabled", more);
    }
  );

  test.each([
    [1, "One unit less of Collar de perlas"],
    [10, "One unit more of Collar de perlas"],
  ])(
    "at %i, the step past the end keeps focus and asks for nothing",
    async (quantity, name) => {
      const { onQuantity, user } = setup({ quantity });
      const step = screen.getByRole("button", { name });

      await user.click(step);

      expect(step).toHaveFocus();
      expect(step).toBeEnabled();
      expect(onQuantity).not.toHaveBeenCalled();
    }
  );

  test.each([
    ["en", "Remove Collar de perlas"],
    ["es", "Quitar Collar de perlas"],
  ] as const)("in %s, %j takes the article out", async (locale, name) => {
    const { onQuantity, user } = setup({ locale });

    await user.click(screen.getByRole("button", { name }));

    expect(onQuantity).toHaveBeenCalledExactlyOnceWith(0);
  });

  test.each(["gone", "pending", null] as const)(
    "a %s line's remove button is a 44 px target the cart can find",
    (flag) => {
      setup({ flag, product: flag === null ? makeProduct() : null });

      const remove = screen.getByRole("button", { name: /^Remove /u });
      expect(remove).toHaveClass("size-11");
      expect(remove).toHaveAttribute("data-cart-remove", "");
    }
  );

  test("a line whose article is on its way is busy, the shape of a name and a price", () => {
    const { line } = setup({ flag: "pending", product: null });

    expect(line()).toHaveAttribute("aria-busy", "true");
    // A bare tile: not "no photo" before the shop has said so.
    expect(
      line().querySelector('[data-slot="store-cart-line-tile"]')?.innerHTML
    ).toBe("");
    const bars = [...line().querySelectorAll('span[aria-hidden="true"]')];
    expect(bars.map((bar) => bar.className)).toEqual([
      "h-3 w-3/4 bg-store-surface",
      "h-3 w-1/3 bg-store-surface",
    ]);
  });

  test("a line with its article is not busy", () => {
    const { line } = setup();

    expect(line()).not.toHaveAttribute("aria-busy");
  });

  test("just added, the line rises into place under a lime wash that fades, both only with motion", () => {
    const { line } = setup({ justAdded: true });

    expect(line()).toHaveAttribute("data-just-added", "");
    const wash = line().querySelector('[data-slot="store-cart-line-wash"]');
    expect(wash).toHaveAttribute("aria-hidden", "true");
    expect(wash).toHaveClass(
      "bg-store-accent/30",
      "motion-safe:animate-store-wash",
      "motion-reduce:hidden"
    );
    expect(line().firstElementChild).toBe(wash);
    expect(wash?.nextElementSibling).toHaveClass(
      "motion-safe:animate-store-rise"
    );
  });

  test.each([
    ["not just added", { justAdded: false }],
    [
      "just added, its article still on its way",
      {
        flag: "pending",
        justAdded: true,
        product: null,
      },
    ],
  ] as const)("%s, the line is neither washed nor rising", (_case, options) => {
    const { line } = setup(options);

    expect(line()).not.toHaveAttribute("data-just-added");
    expect(
      line().querySelector('[data-slot="store-cart-line-wash"]')
    ).toBeNull();
    expect(
      line().querySelector(".motion-safe\\:animate-store-rise")
    ).toBeNull();
  });

  test("the rise starts once the article arrives, not with the placeholder", () => {
    const { line, refresh } = setup({
      flag: "pending",
      justAdded: true,
      product: null,
    });
    const placeholder = line().firstElementChild;

    refresh({ flag: null, product: makeProduct() });

    const wash = line().firstElementChild;
    expect(wash).toHaveAttribute("data-slot", "store-cart-line-wash");
    expect(wash?.nextElementSibling).not.toBe(placeholder);
    expect(wash?.nextElementSibling).toHaveClass(
      "motion-safe:animate-store-rise"
    );
  });

  test.each([
    ["en", "2 × UYU 1,250", "UYU 2,500"],
    ["es", "2 × $ 1.250", "$ 2.500"],
  ] as const)(
    "in %s, a summary line says %j and what they come to, %j, with nothing to change",
    (locale, each, total) => {
      const { line } = setup({ locale, variant: "summary" });

      expect(line()).toHaveAttribute("data-variant", "summary");
      expect(
        screen
          .getByTestId("store-cart-line-price")
          .textContent?.replaceAll("\u00A0", " ")
      ).toBe(each);
      expect(
        screen
          .getByTestId("store-cart-line-total")
          .textContent?.replaceAll("\u00A0", " ")
      ).toBe(total);
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByRole("group")).toBeNull();
      expect(
        line().querySelector('[data-slot="store-cart-line-tile"]')
      ).toHaveClass("size-16");
      expect(
        screen.getByRole("link", { name: "Collar de perlas" })
      ).toHaveAttribute(
        "href",
        locale === "en"
          ? "/en/productos/collar-de-perlas"
          : "/productos/collar-de-perlas"
      );
    }
  );

  test("a sold-out summary line says so, with no price, no total and nothing to press", () => {
    const { line } = setup({
      flag: "unavailable",
      product: makeProduct({ isAvailable: false }),
      variant: "summary",
    });

    expect(line()).toHaveAttribute("data-flag", "unavailable");
    expect(screen.getByText("Sold out for now.")).toBeVisible();
    expect(screen.queryByTestId("store-cart-line-price")).toBeNull();
    expect(screen.queryByTestId("store-cart-line-total")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("a summary line whose price changed says what it was and still counts", () => {
    setup({
      flag: "price_changed",
      seenPriceAmount: 100_000,
      variant: "summary",
    });

    expect(
      screen.getByText("The price changed: it was UYU 1,000.")
    ).toBeVisible();
    expect(
      screen
        .getByTestId("store-cart-line-total")
        .textContent?.replaceAll("\u00A0", " ")
    ).toBe("UYU 2,500");
  });
});
