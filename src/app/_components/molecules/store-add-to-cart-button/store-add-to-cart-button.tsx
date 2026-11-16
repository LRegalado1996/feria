"use client";

import { ShoppingBag } from "lucide-react";
import { useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
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
}

/**
 * Adds one of an article to the store's cart (FER-023), from its card: an
 * outlined pill, so the card's name and price stay what is read first. It
 * says in a polite live region beside it what adding did: added, or why not
 * (the article already at its cap, the cart at its cap of articles). The
 * header's count follows by itself.
 */
function StoreAddToCartButton({
  className,
  name,
  priceAmount,
  productId,
}: StoreAddToCartButtonProps) {
  const copy = useDictionary().storefront.catalog;
  const { add } = useCart();
  // The count changes the text even when the message repeats, so a second
  // "Added" is announced like the first.
  const [status, setStatus] = useState({ count: 0, text: "" });
  // Disabled until React owns it: a press on the server's HTML would add
  // nothing and say nothing.
  const hydrated = useHydrated();

  return (
    <div
      className={cn("flex flex-col gap-1", className)}
      data-slot="store-add-to-cart-button"
    >
      <StoreButton
        aria-label={interpolate(copy.addToCart, { name })}
        className="w-full"
        disabled={!hydrated}
        onClick={() => {
          const text = addOutcomeMessage(add(productId, 1, priceAmount), copy);
          setStatus((previous) => ({ count: previous.count + 1, text }));
        }}
        type="button"
        variant="outline"
      >
        <ShoppingBag aria-hidden="true" />
        {copy.addToCartShort}
      </StoreButton>
      <output aria-live="polite" className="text-xs text-store-muted">
        {status.text}
        {/* An invisible mark that alternates, so a repeated message is new. */}
        {status.count % 2 === 1 ? "⁠" : null}
      </output>
    </div>
  );
}

export { StoreAddToCartButton };
