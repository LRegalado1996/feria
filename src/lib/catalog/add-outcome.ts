import type { Dictionary } from "@/content";
import type { AddOutcome } from "@/lib/hooks/cart";
import { interpolate } from "@/lib/i18n/interpolate";
import { CART_ITEMS_MAX, CART_QUANTITY_MAX } from "@/lib/schemas/cart";

/** What to tell the shopper after adding to the cart, in the page's words. */
export function addOutcomeMessage(
  outcome: AddOutcome,
  copy: Dictionary["storefront"]["catalog"]
): string {
  const messages: Record<AddOutcome, string> = {
    added: copy.added,
    at_max: interpolate(copy.atMax, { max: CART_QUANTITY_MAX }),
    cart_full: interpolate(copy.cartFull, { max: CART_ITEMS_MAX }),
    refused: copy.addFailed,
  };

  return messages[outcome];
}
