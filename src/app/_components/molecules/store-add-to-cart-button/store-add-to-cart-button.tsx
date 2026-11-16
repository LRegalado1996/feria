"use client";

import { ShoppingBag } from "lucide-react";
import { useState } from "react";

import { addOutcomeMessage } from "@/lib/catalog/add-outcome";
import { useCart } from "@/lib/hooks/cart";
import { useDictionary } from "@/lib/hooks/i18n";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

export interface StoreAddToCartButtonProps {
  className?: string;
  /** The article's name, for the button's accessible name. */
  name: string;
  /** The price the card shows, so the cart can say if it changes. */
  priceAmount: number;
  productId: number;
  storeSlug: string;
}

/**
 * Adds one of an article to the store's cart (FER-023), and says so in a
 * polite live region beside it: added, or why not (the article already at
 * its cap, the cart at its cap of articles). The header's count follows by
 * itself.
 */
function StoreAddToCartButton({
  className,
  name,
  priceAmount,
  productId,
  storeSlug,
}: StoreAddToCartButtonProps) {
  const copy = useDictionary().storefront.catalog;
  const { add } = useCart(storeSlug);
  // The count changes the text even when the message repeats, so a second
  // "Added" is announced like the first.
  const [status, setStatus] = useState({ count: 0, text: "" });
  // Disabled until React owns it: a press on the server's HTML would add
  // nothing and say nothing.
  const hydrated = useHydrated();

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <button
        aria-label={interpolate(copy.addToCart, { name })}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-store-contrast px-4 text-sm font-semibold text-store-background hover:bg-store-accent hover:text-store-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground disabled:cursor-not-allowed disabled:opacity-50"
        data-slot="store-add-to-cart-button"
        disabled={!hydrated}
        onClick={() => {
          const text = addOutcomeMessage(add(productId, 1, priceAmount), copy);
          setStatus((previous) => ({ count: previous.count + 1, text }));
        }}
        type="button"
      >
        <ShoppingBag aria-hidden="true" className="size-4" />
        {copy.addToCartShort}
      </button>
      <output aria-live="polite" className="text-xs text-store-muted">
        {status.text}
        {/* An invisible mark that alternates, so a repeated message is new. */}
        {status.count % 2 === 1 ? "\u2060" : null}
      </output>
    </div>
  );
}

export { StoreAddToCartButton };
