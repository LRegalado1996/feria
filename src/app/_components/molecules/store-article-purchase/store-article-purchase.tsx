"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { addOutcomeMessage } from "@/lib/catalog/add-outcome";
import { useCart } from "@/lib/hooks/cart";
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
}

/**
 * How many to take and the button that adds them (FER-024): a pill with the
 * two steps and the count, beside the page's one primary pill, which takes
 * the rest of the row (FER-039). From 1 to the per-article cap; what adding
 * did is said in a polite live region, a repeat included.
 */
function StoreArticlePurchase({
  className,
  priceAmount,
  productId,
}: StoreArticlePurchaseProps) {
  const { storefront } = useDictionary();
  const copy = storefront.article;
  const { add, items } = useCart();
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
      {/* On a narrow phone the button drops under the quantity rather
          than squeezing it. */}
      <div className="flex flex-wrap items-stretch gap-2.5">
        <fieldset className="inline-flex h-13 shrink-0 items-center rounded-full border-2 border-store-foreground px-0.5">
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
            className="min-w-8 text-center text-base font-semibold tabular-nums"
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
          // Beside the quantity only where its label fits on one line there;
          // otherwise (a phone, the article's column on a computer) it takes
          // a row of its own, full width, rather than breaking its label.
          className="min-w-0 grow basis-60 px-5 text-center text-xs whitespace-normal"
          disabled={!hydrated}
          onClick={() => {
            const had =
              items.find((item) => item.productId === productId)?.quantity ?? 0;
            const outcome = add(productId, quantity, priceAmount);
            // The cart keeps at most the cap of one article: when it took
            // fewer than chosen, the shopper is told how many, not "added".
            const added = Math.min(quantity, CART_QUANTITY_MAX - had);
            const text =
              outcome === "added" && added < quantity
                ? interpolate(copy.addedCapped, {
                    added,
                    max: CART_QUANTITY_MAX,
                  })
                : addOutcomeMessage(outcome, storefront.catalog);
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
