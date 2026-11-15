import { describe, expect, test } from "vitest";

import {
  CART_ITEMS_MAX,
  CART_QUANTITY_MAX,
  cartItemSchema,
  cartSchema,
  listCartProductsSchema,
} from ".";

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

describe("cartItemSchema", () => {
  test.each([
    ["without a seen price", makeItem(5, 2)],
    ["with a seen price", { ...makeItem(5, 2), seenPriceAmount: 125_000 }],
    ["with a seen price of zero", { ...makeItem(5, 2), seenPriceAmount: 0 }],
  ])("accepts a line %s, as it was given", (_case, line) => {
    expect(cartItemSchema.parse(line)).toEqual(line);
  });

  test.each([
    ["a negative seen price", -1],
    ["a fractional seen price", 10.5],
    ["a seen price past int4", 2_147_483_648],
    ["a seen price as text", "100"],
  ])("refuses %s", (_case, seenPriceAmount) => {
    expect(
      cartItemSchema.safeParse({ ...makeItem(5), seenPriceAmount }).success
    ).toBe(false);
  });
});

/** The cart's articles as the cart page asks for them. */
function makeListInput(ids: unknown[]) {
  return { ids, locale: "es", storeSlug: "lr-market" };
}

/** `count` distinct ids, from 1. */
function makeIds(count: number) {
  return Array.from({ length: count }, (_, index) => index + 1);
}

describe("listCartProductsSchema", () => {
  test.each([
    ["one id", makeIds(1)],
    ["exactly 20 ids", makeIds(20)],
  ])("accepts %s", (_case, ids) => {
    expect(listCartProductsSchema.parse(makeListInput(ids))).toEqual(
      makeListInput(ids)
    );
  });

  test("reads ids from the query string as numbers", () => {
    expect(listCartProductsSchema.parse(makeListInput(["4", "9"])).ids).toEqual(
      [4, 9]
    );
  });

  test.each([
    ["no ids", []],
    ["21 ids", makeIds(21)],
    ["an empty id", [""]],
    ["an id of zero", [0]],
    ["a fractional id", [1.5]],
    ["an id past int4", [2_147_483_648]],
  ])("refuses %s", (_case, ids) => {
    expect(listCartProductsSchema.safeParse(makeListInput(ids)).success).toBe(
      false
    );
  });

  test("refuses the same article asked for twice, and says so", () => {
    expect(
      listCartProductsSchema
        .safeParse(makeListInput([4, "4"]))
        .error?.issues.map((issue) => [issue.path.join("."), issue.message])
    ).toEqual([["ids", "Each article is asked for once"]]);
  });

  test.each([
    ["another language", { locale: "fr" }],
    ["a store slug that is not one", { storeSlug: "LR Market" }],
  ])("refuses %s", (_case, overrides) => {
    expect(
      listCartProductsSchema.safeParse({ ...makeListInput([4]), ...overrides })
        .success
    ).toBe(false);
  });
});
