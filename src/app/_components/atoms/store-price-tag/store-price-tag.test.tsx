import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { StorePriceTag, type StorePriceTagProps } from "./store-price-tag";

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// Intl separates a currency from its amount with a no-break space.
const NBSP = " ";

function setup(props: Partial<StorePriceTagProps> = {}) {
  const { container } = render(
    <StorePriceTag amount={89_000} currency="UYU" locale="en" {...props} />
  );
  const tag = container.querySelector('[data-slot="store-price-tag"]');

  return {
    amount: tag?.querySelector('[data-slot="store-price-tag-amount"]'),
    previous: tag?.querySelector('[data-slot="store-price-tag-previous"]'),
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
      const { amount: block } = setup({ amount, currency, locale });

      expect(block?.textContent).toBe(text);
    }
  );

  test("a regular price sits on the contrast color, alone", () => {
    const { amount, previous, tag } = setup();

    expect(tag).toHaveAttribute("data-sale", "false");
    expect(amount).toHaveClass("bg-store-contrast", "text-store-background");
    expect(amount).not.toHaveClass("bg-store-accent");
    expect(previous).toBeNull();
  });

  test.each([
    ["en", `Was UYU${NBSP}1,290`],
    ["es", `Antes $${NBSP}1.290`],
  ] as const)(
    "in %s, a reduced price takes the accent and shows %j struck through",
    (locale, text) => {
      const { amount, previous, tag } = setup({
        locale,
        previousAmount: 129_000,
      });

      expect(tag).toHaveAttribute("data-sale", "true");
      expect(amount).toHaveClass("bg-store-accent", "text-store-foreground");
      expect(amount).not.toHaveClass("bg-store-contrast");
      expect(previous?.tagName).toBe("S");
      expect(previous?.textContent).toBe(text);
    }
  );

  test.each([
    ["equal to", 89_000],
    ["lower than", 88_999],
  ])(
    "a previous price %s the current one is not a deal",
    (_label, previousAmount) => {
      const { amount, previous, tag } = setup({ previousAmount });

      expect(tag).toHaveAttribute("data-sale", "false");
      expect(amount).toHaveClass("bg-store-contrast");
      expect(previous).toBeNull();
    }
  );

  test("one minor unit above the current price is already a deal", () => {
    const { previous, tag } = setup({ previousAmount: 89_001 });

    expect(tag).toHaveAttribute("data-sale", "true");
    expect(previous?.textContent).toBe(`Was UYU${NBSP}890.01`);
  });

  test("a null previous price is a regular price", () => {
    const { previous, tag } = setup({ previousAmount: null });

    expect(tag).toHaveAttribute("data-sale", "false");
    expect(previous).toBeNull();
  });

  test.each([
    ["sm", "text-2xl", "text-4xl"],
    ["lg", "text-4xl", "text-2xl"],
  ] as const)("the %s size carries %s", (size, expected, other) => {
    const { amount, tag } = setup({ size });

    expect(tag).toHaveAttribute("data-size", size);
    expect(amount).toHaveClass(expected);
    expect(amount).not.toHaveClass(other);
  });

  test("is small by default and keeps a caller's class", () => {
    const { amount, tag } = setup({ className: "mt-2" });

    expect(tag).toHaveAttribute("data-size", "sm");
    expect(tag).toHaveClass("mt-2", "flex");
    expect(amount).toHaveClass("text-2xl");
  });
});
