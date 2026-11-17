"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { addOutcomeMessage } from "@/lib/catalog/add-outcome";
import { useCart, useCartPanel } from "@/lib/hooks/cart";
import { useDictionary } from "@/lib/hooks/i18n";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import { interpolate } from "@/lib/i18n/interpolate";
import { CART_QUANTITY_MAX } from "@/lib/schemas/cart";
import { cn } from "@/lib/utils";

export interface StoreArticlePurchaseProps {
  className?: string;
  /** The price the page shows, so the cart can say if it changes. */
  priceAmount: number;
  productId: number;
  /** The article's name, for what adding did. */
  title: string;
}

/**
 * How many to take and the button that adds them (FER-024): a pill with the
 * two steps and the count, and beside it, on one row at every width down to
 * 375 px, the page's one primary pill, which takes the rest of the row
 * (FER-039, like landonorris.store's "QTY 1" beside "ADD TO BAG"). From 1
 * to the per-article cap. What adding did opens the cart's side panel with
 * the article's line marked and says so there (FER-045); what it could not
 * do, and anything at all outside a store page's frame, is said here, in a
 * polite live region, a repeat included.
 */
function StoreArticlePurchase({
  className,
  priceAmount,
  productId,
  title,
}: StoreArticlePurchaseProps) {
  const { storefront } = useDictionary();
  const copy = storefront.article;
  const { add, items } = useCart();
  const panel = useCartPanel();
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState({ count: 0, text: "" });
  // Disabled until React owns it: a press on the server's HTML would add
  // nothing and say nothing.
  const hydrated = useHydrated();

  return (
    <div
      className={cn("flex flex-col gap-3", className)}
      data-slot="store-article-purchase"
    >
      {/* One row: the stepper keeps its 44 px steps and gives up its
          padding first, so the label fits beside it on a 375 px phone. */}
      <div
        className="flex items-stretch gap-2"
        data-testid="store-article-purchase-row"
      >
        <fieldset className="inline-flex h-13 shrink-0 items-center rounded-full border-2 border-store-foreground">
          {/* Its steps say what they do; the group's name is for a screen
              reader, which hears it on entering. */}
          <legend className="sr-only">{copy.quantity}</legend>
          <StoreButton
            disabled={quantity <= 1}
            onClick={() => {
              setQuantity((value) => Math.max(value - 1, 1));
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Minus aria-hidden="true" className="size-4" />
            <span className="sr-only">{copy.decrease}</span>
          </StoreButton>
          <output
            aria-live="polite"
            className="min-w-7 text-center text-base font-semibold tabular-nums"
            data-testid="store-article-quantity"
          >
            {quantity}
          </output>
          <StoreButton
            disabled={quantity >= CART_QUANTITY_MAX}
            onClick={() => {
              setQuantity((value) => Math.min(value + 1, CART_QUANTITY_MAX));
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Plus aria-hidden="true" className="size-4" />
            <span className="sr-only">{copy.increase}</span>
          </StoreButton>
        </fieldset>
        <StoreButton
          // The rest of the row. Its label fits on one line at 375 px; on a
          // narrower screen, or a larger text setting, it breaks inside the
          // pill rather than pushing the pill under the quantity.
          className="min-w-0 flex-1 px-3.5 text-center text-xs leading-tight whitespace-normal"
          disabled={!hydrated}
          onClick={(event) => {
            const had =
              items.find((item) => item.productId === productId)?.quantity ?? 0;
            const outcome = add(productId, quantity, priceAmount);
            // The cart keeps at most the cap of one article: when it took
            // fewer than chosen, the shopper is told how many, not "added".
            const added = Math.min(quantity, CART_QUANTITY_MAX - had);
            let text = addOutcomeMessage(outcome, storefront.catalog);

            if (outcome === "added" && added < quantity) {
              text = interpolate(copy.addedCapped, {
                added,
                max: CART_QUANTITY_MAX,
              });
            } else if (outcome === "added" && panel) {
              text = interpolate(storefront.cart.panel.added, { title });
            }

            if (outcome === "added" && panel) {
              panel.open({
                added: { message: text, productId },
                returnFocus: event.currentTarget,
              });
              // Said in the panel: nothing older stays under the button.
              text = "";
            }

            setStatus((previous) => ({ count: previous.count + 1, text }));
          }}
          size="lg"
          type="button"
        >
          {copy.addToCart}
        </StoreButton>
      </div>
      <output aria-live="polite" className="text-sm text-store-muted">
        {status.text}
        {/* An invisible mark that alternates, so a repeated message is new. */}
        {status.count % 2 === 1 ? "⁠" : null}
      </output>
    </div>
  );
}

export { StoreArticlePurchase };
