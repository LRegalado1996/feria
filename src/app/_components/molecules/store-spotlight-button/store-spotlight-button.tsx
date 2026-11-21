"use client";

import { useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { useAddToCart } from "@/lib/hooks/cart";
import { useDictionary } from "@/lib/hooks/i18n";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import { cn } from "@/lib/utils";

export interface StoreSpotlightButtonProps {
  className?: string;
  /** The price the block shows, so the cart can say if it changes. */
  priceAmount: number;
  productId: number;
  /** The article's name: for what adding did, and the button's own name. */
  title: string;
}

/**
 * The spotlight's "Agregar al carrito" (FER-059), on the moss: the lime
 * pill with ink words, its focus ring lime, as the cart panel's main
 * action. It adds one unit the store's one way (`useAddToCart`): the cart's
 * side panel opens with the line marked; what adding could not do, or
 * anything outside a store page's frame (the admin's preview), is said
 * under it in a polite live region. A real button, named with the article
 * after its visible words ("Agregar al carrito: Burbujero pez"), so two
 * spotlights on a page are told apart. Disabled until React owns it: a
 * press on the server's HTML would add nothing and say nothing.
 */
function StoreSpotlightButton({
  className,
  priceAmount,
  productId,
  title,
}: StoreSpotlightButtonProps) {
  const copy = useDictionary().storefront.article;
  const addToCart = useAddToCart();
  const hydrated = useHydrated();
  const [status, setStatus] = useState({ count: 0, text: "" });

  return (
    <div
      className={cn("flex flex-col items-start gap-2", className)}
      data-slot="store-spotlight-button"
    >
      <StoreButton
        // Its visible words first, so a voice command that says them works.
        aria-label={`${copy.addToCart}: ${title}`}
        className="focus-visible:outline-store-accent"
        data-testid="store-spotlight-add"
        disabled={!hydrated}
        onClick={(event) => {
          const text = addToCart({
            priceAmount,
            productId,
            quantity: 1,
            returnFocus: event.currentTarget,
            title,
          });

          setStatus((previous) => ({ count: previous.count + 1, text }));
        }}
        size="lg"
        type="button"
        variant="accent"
      >
        {copy.addToCart}
      </StoreButton>
      <output aria-live="polite" className="text-sm text-store-contrast-muted">
        {status.text}
        {/* An invisible mark that alternates, so a repeated message is new. */}
        {status.count % 2 === 1 ? "⁠" : null}
      </output>
    </div>
  );
}

export { StoreSpotlightButton };
