import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { DICTIONARIES } from "@/test/i18n";

import {
  StorePriceTag,
  type StorePriceTagProps,
  storePriceTagVariants,
} from "./store-price-tag";

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// Intl separates a currency from its amount with a no-break space.
const NBSP = " ";

/** The tag, its words those of the page's language unless given. */
function setup(props: Partial<StorePriceTagProps> = {}) {
  const locale = props.locale ?? "en";
  const { container } = render(
    <StorePriceTag
      amount={89_000}
      currency="UYU"
      labels={DICTIONARIES[locale].storefront.price}
      locale={locale}
      {...props}
    />
  );
  const tag = container.querySelector('[data-slot="store-price-tag"]');
  const previous = tag?.querySelector('[data-slot="store-price-tag-previous"]');

  return {
    amount: tag?.querySelector('[data-slot="store-price-tag-amount"]'),
    previous,
    /** What a screen reader hears for the struck price. */
    previousSpoken: previous?.querySelector(".sr-only")?.textContent,
    /** What the eye reads, struck through. */
    previousShown: previous?.querySelector('[aria-hidden="true"]')?.textContent,
    tag,
  };
}

describe("StorePriceTag", () => {
  test.each([
    ["es", "UYU", 129_000, `$${NBSP}1.290`],
    ["en", "UYU", 129_000, `UYU${NBSP}1,290`],
    ["es", "USD", 1250, `US$${NBSP}12,50`],
    ["en", "USD", 1250, `USD${NBSP}12.50`],
  ] as const)(
    "in %s, %s %i minor units read %j",
    (locale, currency, amount, text) => {
      const { amount: shown } = setup({ amount, currency, locale });

      expect(shown?.textContent).toBe(text);
    }
  );

  test("a regular price is the amount alone, in the foreground, in regular type", () => {
    const { amount, previous, tag } = setup();

    expect(tag).toHaveAttribute("data-sale", "false");
    expect(tag).toHaveClass("text-store-foreground", "tabular-nums");
    expect(tag).not.toHaveClass("font-display");
    expect(tag?.textContent).toBe(amount?.textContent);
    expect(previous).toBeNull();
  });

  test.each([
    ["en", `UYU${NBSP}1,290`, `Was UYU${NBSP}1,290`],
    ["es", `$${NBSP}1.290`, `Antes $${NBSP}1.290`],
  ] as const)(
    "in %s, a reduced price comes after %j struck through, which is read as %j",
    (locale, shown, spoken) => {
      const { amount, previous, previousShown, previousSpoken, tag } = setup({
        locale,
        previousAmount: 129_000,
      });

      expect(tag).toHaveAttribute("data-sale", "true");
      expect(previous?.tagName).toBe("S");
      expect(previous).toHaveClass("text-store-muted");
      expect(previousShown).toBe(shown);
      expect(previousSpoken).toBe(spoken);
      // The price it had first, then the price it has.
      expect(tag?.firstElementChild).toBe(previous);
      expect(tag?.lastElementChild).toBe(amount);
    }
  );

  test.each([
    ["equal to", 89_000],
    ["lower than", 88_999],
  ])(
    "a previous price %s the current one is not a deal",
    (_label, previousAmount) => {
      const { previous, tag } = setup({ previousAmount });

      expect(tag).toHaveAttribute("data-sale", "false");
      expect(previous).toBeNull();
    }
  );

  test("one minor unit above the current price is already a deal", () => {
    const { previousSpoken, tag } = setup({ previousAmount: 89_001 });

    expect(tag).toHaveAttribute("data-sale", "true");
    expect(previousSpoken).toBe(`Was UYU${NBSP}890.01`);
  });

  test("says the previous price with the words it is given", () => {
    const { previousSpoken } = setup({
      labels: { previous: "Before: {price}" },
      previousAmount: 129_000,
    });

    expect(previousSpoken).toBe(`Before: UYU${NBSP}1,290`);
  });

  test("a null previous price is a regular price", () => {
    const { previous, tag } = setup({ previousAmount: null });

    expect(tag).toHaveAttribute("data-sale", "false");
    expect(previous).toBeNull();
  });

  test.each([
    ["sm", "text-sm", "text-xl"],
    ["lg", "text-xl", "text-sm"],
  ] as const)("the %s size carries %s", (size, expected, other) => {
    const { tag } = setup({ size });

    expect(tag).toHaveAttribute("data-size", size);
    expect(tag).toHaveClass(expected);
    expect(tag).not.toHaveClass(other);
  });

  test("is small by default and keeps a caller's class", () => {
    const { tag } = setup({ className: "mt-2" });

    expect(tag).toHaveAttribute("data-size", "sm");
    expect(tag).toHaveClass("mt-2", "flex", "text-sm");
  });

  test("exposes its sizes", () => {
    expect(storePriceTagVariants({ size: "lg" })).toContain("text-xl");
  });
});
