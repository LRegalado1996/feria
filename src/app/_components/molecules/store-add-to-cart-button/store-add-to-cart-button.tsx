"use client";

import { ShoppingBag } from "lucide-react";
import { useState } from "react";

import { useCart } from "@/lib/hooks/cart";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

export interface StoreAddToCartButtonProps {
  className?: string;
  /** The article's name, for the button's accessible name. */
  name: string;
  productId: number;
  storeSlug: string;
}

/**
 * Adds one of an article to the store's cart (FER-023), and says so in a
 * polite live region beside it: added, or refused because the cart already
 * holds twenty different articles. The header's count follows by itself.
 */
function StoreAddToCartButton({
  className,
  name,
  productId,
  storeSlug,
}: StoreAddToCartButtonProps) {
  const copy = useDictionary().storefront.catalog;
  const { add } = useCart(storeSlug);
  const [status, setStatus] = useState("");

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <button
        aria-label={interpolate(copy.addToCart, { name })}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-store-contrast px-4 text-sm font-semibold text-store-background hover:bg-store-accent hover:text-store-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
        data-slot="store-add-to-cart-button"
        onClick={() => {
          setStatus(add(productId) ? copy.added : copy.cartFull);
        }}
        type="button"
      >
        <ShoppingBag aria-hidden="true" className="size-4" />
        {copy.addToCartShort}
      </button>
      <output aria-live="polite" className="text-xs text-store-muted">
        {status}
      </output>
    </div>
  );
}

export { StoreAddToCartButton };
