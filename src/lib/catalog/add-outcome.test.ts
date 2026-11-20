import { describe, expect, test } from "vitest";

import { DICTIONARIES } from "@/test/i18n";

import { addOutcomeMessage } from "./add-outcome";

describe("addOutcomeMessage", () => {
  test.each([
    ["es", "added", "Agregado al carrito."],
    ["es", "at_max", "Ya tenés 10 de este artículo, el máximo por pedido."],
    [
      "es",
      "cart_full",
      "El carrito ya tiene 20 artículos distintos, el máximo.",
    ],
    ["es", "refused", "No pudimos agregarlo. Probá de nuevo."],
    ["en", "added", "Added to cart."],
    [
      "en",
      "at_max",
      "You already have 10 of this article, the most an order takes.",
    ],
    [
      "en",
      "cart_full",
      "The cart already holds 20 different articles, the most it takes.",
    ],
    ["en", "refused", "We could not add it. Try again."],
  ] as const)("in %s, %s reads %j", (locale, outcome, message) => {
    expect(
      addOutcomeMessage(outcome, DICTIONARIES[locale].storefront.catalog)
    ).toBe(message);
  });
});
