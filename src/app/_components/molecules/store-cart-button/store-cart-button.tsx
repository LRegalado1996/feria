"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { useCart } from "@/lib/hooks/cart";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

export interface StoreCartButtonProps {
  className?: string;
}

/**
 * The header's cart: a link to the store's cart with how many units it
 * holds. The cart lives in the browser, so the server renders it empty and
 * the count arrives once the page hydrates; its name says the count, for a
 * screen reader that cannot see the badge.
 */
function StoreCartButton({ className }: StoreCartButtonProps) {
  const copy = useDictionary().storefront.shell;
  const locale = useLocale();
  const { count } = useCart();
  let label = copy.cartEmpty;

  if (count === 1) {
    label = copy.cartCountOne;
  } else if (count > 1) {
    label = interpolate(copy.cartCount, { count });
  }

  return (
    <Link
      aria-label={label}
      className={cn(
        // On the header's moss: the accent, 11:1, like the header's links.
        "relative inline-flex size-11 items-center justify-center rounded-full text-store-accent hover:bg-store-accent/15 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent",
        className
      )}
      data-slot="store-cart-button"
      data-testid="store-cart-button"
      href={localizePath("/cart", locale)}
    >
      <ShoppingBag aria-hidden="true" className="size-5" />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-store-accent px-1 text-xs leading-none font-bold text-store-foreground tabular-nums"
          data-testid="store-cart-count"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export { StoreCartButton };
