import { describe, expect, test } from "vitest";

import { CART_ITEMS_MAX, CART_QUANTITY_MAX, cartSchema } from ".";

function makeItem(productId: number, quantity = 1) {
  return { productId, quantity };
}

/** `count` distinct articles, one unit each. */
function makeCart(count: number) {
  return Array.from({ length: count }, (_, index) => makeItem(index + 1));
}

describe("cartSchema", () => {
  test("caps a cart at 20 articles and 10 units each, like an order", () => {
    expect(CART_ITEMS_MAX).toBe(20);
    expect(CART_QUANTITY_MAX).toBe(10);
  });

  test.each([
    ["no articles", makeCart(0)],
    ["exactly 20 articles", makeCart(20)],
    ["one unit", [makeItem(5, 1)]],
    ["exactly 10 units", [makeItem(5, 10)]],
  ])("accepts %s", (_case, cart) => {
    expect(cartSchema.parse(cart)).toEqual(cart);
  });

  test.each([
    ["21 articles", makeCart(21)],
    ["zero units", [makeItem(5, 0)]],
    ["11 units", [makeItem(5, 11)]],
    ["a fractional quantity", [makeItem(5, 1.5)]],
    ["the same article twice", [makeItem(5, 1), makeItem(5, 2)]],
    ["a price smuggled in", [{ ...makeItem(5), unitPrice: 1 }]],
    ["a product id of zero", [makeItem(0)]],
    ["a product id as text", [{ productId: "5", quantity: 1 }]],
    ["an object instead of a list", { productId: 5, quantity: 1 }],
  ])("refuses %s", (_case, cart) => {
    expect(cartSchema.safeParse(cart).success).toBe(false);
  });
});
