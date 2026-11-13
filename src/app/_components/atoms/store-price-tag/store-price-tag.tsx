import { cva, type VariantProps } from "class-variance-authority";

import { getDictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";
import { type Currency, formatPrice } from "@/lib/utils/format";

const amountVariants = cva(
  "font-display leading-none font-normal tracking-display uppercase",
  {
    variants: {
      size: {
        sm: "px-3 py-1.5 text-2xl",
        lg: "px-4 py-2 text-4xl",
      },
      sale: {
        // A reduced price is the one place a price takes the accent.
        true: "bg-store-accent text-store-foreground",
        false: "bg-store-contrast text-store-background",
      },
    },
  }
);

export type StorePriceTagProps = VariantProps<typeof amountVariants> & {
  /** In minor units (cents), as the database stores it. */
  amount: number;
  className?: string;
  currency: Currency;
  locale: Locale;
  /** What it cost before, in minor units. Shown struck through, and only
   *  when it was higher: a price that went up is not announced as a deal. */
  previousAmount?: number | null;
};

/**
 * An article's price, in the display face on a solid block so it is the first
 * thing read on a card. Server-only: it reads the dictionary itself.
 */
function StorePriceTag({
  amount,
  className,
  currency,
  locale,
  previousAmount = null,
  size = "sm",
}: StorePriceTagProps) {
  const { price } = getDictionary(locale).storefront;
  const sale = previousAmount !== null && previousAmount > amount;

  return (
    <p
      className={cn("flex flex-wrap items-center gap-2.5", className)}
      data-sale={sale}
      data-size={size}
      data-slot="store-price-tag"
    >
      <span
        className={amountVariants({ sale, size })}
        data-slot="store-price-tag-amount"
      >
        {formatPrice(amount, currency, locale)}
      </span>
      {sale ? (
        <s
          className="text-sm text-store-muted"
          data-slot="store-price-tag-previous"
        >
          {interpolate(price.previous, {
            price: formatPrice(previousAmount, currency, locale),
          })}
        </s>
      ) : null}
    </p>
  );
}

export { StorePriceTag };
