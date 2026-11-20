"use client";

import { addOutcomeMessage } from "@/lib/catalog/add-outcome";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { CART_QUANTITY_MAX } from "@/lib/schemas/cart";

import { useCart } from "./use-cart";
import { useCartPanel } from "./use-cart-panel";

/** One press of an "Agregar al carrito". */
export interface AddToCartRequest {
  /** The price the page shows, so the cart can say if it changes. */
  priceAmount: number;
  productId: number;
  quantity: number;
  /** What was pressed: focus goes back to it when the panel closes. */
  returnFocus: HTMLElement | null;
  /** The article's name, for what adding did. */
  title: string;
}

/**
 * Adding an article to the cart, as every "Agregar al carrito" of the
 * store does it (FER-024, FER-045; the home's spotlight, FER-059): the
 * cart keeps at most the per-article cap, and what adding did opens the
 * cart's side panel with the article's line marked and says so there.
 * Answers what to say beside the button instead: what adding could not do
 * (the cap, a full cart, a refusal), or anything at all outside a store
 * page's frame, where there is no panel; `""` when the panel said it.
 */
export function useAddToCart(): (request: AddToCartRequest) => string {
  const { storefront } = useDictionary();
  const { add, items } = useCart();
  const panel = useCartPanel();

  return ({ priceAmount, productId, quantity, returnFocus, title }) => {
    const had =
      items.find((item) => item.productId === productId)?.quantity ?? 0;
    const outcome = add(productId, quantity, priceAmount);
    // The cart keeps at most the cap of one article: when it took fewer
    // than chosen, the shopper is told how many, not "added".
    const added = Math.min(quantity, CART_QUANTITY_MAX - had);

    let text = addOutcomeMessage(outcome, storefront.catalog);

    if (outcome === "added" && added < quantity) {
      text = interpolate(storefront.article.addedCapped, {
        added,
        max: CART_QUANTITY_MAX,
      });
    } else if (outcome === "added" && panel) {
      text = interpolate(storefront.cart.panel.added, { title });
    }

    if (outcome === "added" && panel) {
      panel.open({ added: { message: text, productId }, returnFocus });

      // Said in the panel: nothing older stays under the button.
      return "";
    }

    return text;
  };
}
