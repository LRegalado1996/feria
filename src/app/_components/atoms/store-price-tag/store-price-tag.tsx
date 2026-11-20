import { cva, type VariantProps } from "class-variance-authority";

import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";
import { type Currency, formatPrice } from "@/lib/utils/format";

const storePriceTagVariants = cva(
  "flex flex-wrap items-baseline gap-x-2 text-store-foreground tabular-nums",
  {
    variants: {
      size: {
        // Under a card's name.
        sm: "text-sm",
        // Under an article's name, on its page.
        lg: "text-xl",
      },
    },
    defaultVariants: { size: "sm" },
  }
);

export type StorePriceTagProps = VariantProps<typeof storePriceTagVariants> & {
  /** In minor units (cents), as the database stores it. */
  amount: number;
  className?: string;
  currency: Currency;
  /** Its words, from `getDictionary` on the server or `useDictionary` in the browser. */
  labels: Dictionary["storefront"]["price"];
  locale: Locale;
  /** What it cost before, in minor units. Shown struck through, and only
   *  when it was higher: a price that went up is not announced as a deal. */
  previousAmount?: number | null;
};

/**
 * An article's price in the body face, regular weight (FER-039): the reduced
 * one comes after the price it had, struck through, which a screen reader
 * hears as "Antes $ 1.290". It takes its words as a prop, so it renders on
 * the server and in the browser alike.
 */
function StorePriceTag({
  amount,
  className,
  currency,
  labels,
  locale,
  previousAmount = null,
  size = "sm",
}: StorePriceTagProps) {
  const sale = previousAmount !== null && previousAmount > amount;

  return (
    <p
      className={cn(storePriceTagVariants({ size }), className)}
      data-sale={sale}
      data-size={size}
      data-slot="store-price-tag"
    >
      {sale ? (
        <s className="text-store-muted" data-slot="store-price-tag-previous">
          {/* Strikethrough is not read aloud: the words say it instead. */}
          <span aria-hidden="true">
            {formatPrice(previousAmount, currency, locale)}
          </span>
          <span className="sr-only">
            {interpolate(labels.previous, {
              price: formatPrice(previousAmount, currency, locale),
            })}
          </span>
        </s>
      ) : null}
      <span data-slot="store-price-tag-amount">
        {formatPrice(amount, currency, locale)}
      </span>
    </p>
  );
}

export { StorePriceTag, storePriceTagVariants };
