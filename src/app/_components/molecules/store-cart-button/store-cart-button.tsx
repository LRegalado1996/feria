"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CHECKOUT_PATH, isPlainClick } from "@/lib/cart/paths";
import { useCart, useCartPanel } from "@/lib/hooks/cart";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

export interface StoreCartButtonProps {
  className?: string;
}

/**
 * The header's cart: a link to the checkout page with how many units the
 * cart holds, which works before the page's script runs and without it.
 * Once React owns it, a plain click opens the cart's side panel instead
 * (FER-045); a click that opens a new tab still follows the link. The cart
 * lives in the browser, so the server renders it empty and the count
 * arrives once the page hydrates; its name says the count, for a screen
 * reader that cannot see the badge. The badge bumps when it shows more than
 * it last did: at once, or as the panel that covered it closes.
 */
function StoreCartButton({ className }: StoreCartButtonProps) {
  const copy = useDictionary().storefront.shell;
  const locale = useLocale();
  const { count } = useCart();
  const panel = useCartPanel();
  const hydrated = useHydrated();
  // The figure the badge last showed in sight, and how often it grew.
  const [shown, setShown] = useState<{ bumps: number; count: number } | null>(
    null
  );
  let label = copy.cartEmpty;

  if (hydrated && !panel?.isOpen && shown?.count !== count) {
    setShown({
      bumps:
        shown && count > shown.count ? shown.bumps + 1 : (shown?.bumps ?? 0),
      count,
    });
  }

  if (count === 1) {
    label = copy.cartCountOne;
  } else if (count > 1) {
    label = interpolate(copy.cartCount, { count });
  }

  const bumps = shown?.bumps ?? 0;

  return (
    <Link
      aria-haspopup={panel && hydrated ? "dialog" : undefined}
      aria-label={label}
      className={cn(
        // On the header's moss: the accent, 11:1, like the header's links.
        "relative inline-flex size-11 items-center justify-center rounded-full text-store-accent hover:bg-store-accent/15 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent",
        className
      )}
      data-slot="store-cart-button"
      data-testid="store-cart-button"
      href={localizePath(CHECKOUT_PATH, locale)}
      onClick={(event) => {
        if (panel && isPlainClick(event)) {
          event.preventDefault();
          panel.open({ returnFocus: event.currentTarget });
        }
      }}
    >
      <ShoppingBag aria-hidden="true" className="size-5" />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1 right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-store-accent px-1 text-xs leading-none font-bold text-store-foreground tabular-nums",
            bumps > 0 && "motion-safe:animate-store-bump"
          )}
          data-bumps={bumps}
          data-testid="store-cart-count"
          // Drawn anew each time it grows, so the bump plays again.
          key={bumps}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export { StoreCartButton };
