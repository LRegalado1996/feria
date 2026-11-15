"use client";

import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useState } from "react";

import { addOutcomeMessage } from "@/lib/catalog/add-outcome";
import { useCart } from "@/lib/hooks/cart";
import { useDictionary } from "@/lib/hooks/i18n";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import { interpolate } from "@/lib/i18n/interpolate";
import { CART_QUANTITY_MAX } from "@/lib/schemas/cart";
import { cn } from "@/lib/utils";

export interface StoreArticlePurchaseProps {
  className?: string;
  productId: number;
  storeSlug: string;
}

const STEP_CLASS =
  "inline-flex size-11 items-center justify-center border-2 border-store-contrast text-store-foreground hover:bg-store-contrast hover:text-store-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground disabled:opacity-40";

/**
 * How many to take and the button that adds them (FER-024), from 1 to the
 * per-article cap; what adding did is said in a polite live region, a
 * repeat included.
 */
function StoreArticlePurchase({
  className,
  productId,
  storeSlug,
}: StoreArticlePurchaseProps) {
  const { storefront } = useDictionary();
  const copy = storefront.article;
  const { add, items } = useCart(storeSlug);
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
      <fieldset className="flex items-center gap-3">
        {/* Floated so it sits beside the stepper; a legend ignores flex. */}
        <legend className="float-left mr-3 text-sm font-semibold">
          {copy.quantity}
        </legend>
        <div className="flex items-center">
          <button
            className={STEP_CLASS}
            disabled={quantity <= 1}
            onClick={() => {
              setQuantity((value) => Math.max(value - 1, 1));
            }}
            type="button"
          >
            <Minus aria-hidden="true" className="size-4" />
            <span className="sr-only">{copy.decrease}</span>
          </button>
          <output
            aria-live="polite"
            className="inline-flex h-11 min-w-12 items-center justify-center border-y-2 border-store-contrast font-display text-2xl leading-none tracking-display tabular-nums"
            data-testid="store-article-quantity"
          >
            {quantity}
          </output>
          <button
            className={STEP_CLASS}
            disabled={quantity >= CART_QUANTITY_MAX}
            onClick={() => {
              setQuantity((value) => Math.min(value + 1, CART_QUANTITY_MAX));
            }}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            <span className="sr-only">{copy.increase}</span>
          </button>
        </div>
      </fieldset>
      <button
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-store-contrast px-6 font-semibold text-store-background hover:bg-store-accent hover:text-store-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!hydrated}
        onClick={() => {
          const had =
            items.find((item) => item.productId === productId)?.quantity ?? 0;
          const outcome = add(productId, quantity);
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
        type="button"
      >
        <ShoppingBag aria-hidden="true" className="size-5" />
        {copy.addToCart}
      </button>
      <output aria-live="polite" className="text-sm text-store-muted">
        {status.text}
        {/* An invisible mark that alternates, so a repeated message is new. */}
        {status.count % 2 === 1 ? "⁠" : null}
      </output>
    </div>
  );
}

export { StoreArticlePurchase };
