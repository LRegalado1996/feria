"use client";

import { CircleAlert, ImageOff, Minus, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { CartProduct } from "@/lib/hooks/cart";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { CART_QUANTITY_MAX } from "@/lib/schemas/cart";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/format";

/**
 * Why a line cannot go into the order as it is, or what changed in it;
 * `pending` while the shop's answer for a newly added article is on its way.
 */
export type CartLineFlag = "gone" | "pending" | "price_changed" | "unavailable";

export interface StoreCartLineProps {
  className?: string;
  flag: CartLineFlag | null;
  /** Called with the new quantity; 0 takes the article out. */
  onQuantity: (quantity: number) => void;
  /** The article as the shop has it now; `null` once it is gone. */
  product: CartProduct | null;
  quantity: number;
  /** What the shopper saw when adding it, for a price that changed. */
  seenPriceAmount: number | undefined;
  storeSlug: string;
}

const STEP_CLASS =
  "inline-flex size-11 items-center justify-center border-2 border-store-contrast text-store-foreground hover:bg-store-contrast hover:text-store-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground aria-disabled:opacity-40";

/**
 * One article in the cart (FER-026): its photo, name and price as the shop
 * has them now, what changed since it was added, its quantity and a way to
 * take it out. A line that is gone or sold out can only be taken out.
 */
function StoreCartLine({
  className,
  flag,
  onQuantity,
  product,
  quantity,
  seenPriceAmount,
  storeSlug,
}: StoreCartLineProps) {
  const { storefront } = useDictionary();
  const copy = storefront.cart;
  const locale = useLocale();
  const title =
    product?.title ??
    (flag === "pending" ? copy.loading : copy.flags.goneTitle);
  const blocked = flag !== null && flag !== "price_changed";
  let notice: string | null = null;

  // A gone line's title already says it is gone.
  if (flag === "unavailable") {
    notice = copy.flags.unavailable;
  } else if (
    flag === "price_changed" &&
    product &&
    seenPriceAmount !== undefined
  ) {
    notice = interpolate(copy.flags.priceChanged, {
      before: formatPrice(seenPriceAmount, product.currencyCode, locale),
    });
  }

  return (
    <li
      className={cn(
        "grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-2 border-b-2 border-store-line py-4",
        className
      )}
      data-flag={flag ?? undefined}
      data-slot="store-cart-line"
      data-testid="store-cart-line"
    >
      <div className="relative row-span-2 size-18 bg-store-line">
        {product?.cover ? (
          <Image
            alt=""
            className={cn("object-cover", blocked && "opacity-50")}
            fill
            sizes="72px"
            src={product.cover.url}
          />
        ) : (
          <ImageOff
            aria-hidden="true"
            className="absolute inset-0 m-auto size-6 text-store-muted"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {product ? (
          <Link
            className="font-semibold text-store-foreground underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
            href={localizePath(
              `/${storeSlug}/products/${product.slug}`,
              locale
            )}
            lang={product.lang}
          >
            {product.title}
          </Link>
        ) : (
          <p className="font-semibold text-store-muted">{title}</p>
        )}
        {product && !blocked ? (
          <p className="text-sm text-store-muted tabular-nums">
            {interpolate(copy.unitPrice, {
              price: formatPrice(
                product.priceAmount,
                product.currencyCode,
                locale
              ),
            })}
          </p>
        ) : null}
        {/* Mounted always, so a notice a refresh brings is announced: a
            live region added together with its text is often not read.
            Empty, it is `sr-only`, out of the column's flow and its gap. */}
        <output
          aria-live="polite"
          className={
            notice
              ? "flex items-center gap-1.5 text-sm font-semibold text-store-foreground"
              : "sr-only"
          }
          data-testid="store-cart-line-notice"
        >
          {notice ? (
            <>
              <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
              {notice}
            </>
          ) : null}
        </output>
      </div>
      <div className="flex items-center justify-between gap-3">
        {blocked ? (
          <span />
        ) : (
          <fieldset className="flex items-center">
            <legend className="sr-only">
              {interpolate(copy.quantity, { title })}
            </legend>
            {/* `aria-disabled`, not `disabled`: a button that disables
                itself under the finger drops keyboard focus. */}
            <button
              aria-disabled={quantity <= 1}
              className={STEP_CLASS}
              onClick={() => {
                if (quantity > 1) {
                  onQuantity(quantity - 1);
                }
              }}
              type="button"
            >
              <Minus aria-hidden="true" className="size-4" />
              <span className="sr-only">
                {interpolate(copy.decrease, { title })}
              </span>
            </button>
            <output
              aria-live="polite"
              className="inline-flex h-11 min-w-11 items-center justify-center border-y-2 border-store-contrast font-display text-xl leading-none tracking-display tabular-nums"
              data-testid="store-cart-quantity"
            >
              {quantity}
            </output>
            <button
              aria-disabled={quantity >= CART_QUANTITY_MAX}
              className={STEP_CLASS}
              onClick={() => {
                if (quantity < CART_QUANTITY_MAX) {
                  onQuantity(quantity + 1);
                }
              }}
              type="button"
            >
              <Plus aria-hidden="true" className="size-4" />
              <span className="sr-only">
                {interpolate(copy.increase, { title })}
              </span>
            </button>
          </fieldset>
        )}
        <button
          className="inline-flex size-11 shrink-0 items-center justify-center text-store-foreground hover:bg-store-contrast hover:text-store-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
          data-cart-remove=""
          onClick={() => {
            onQuantity(0);
          }}
          type="button"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          <span className="sr-only">{interpolate(copy.remove, { title })}</span>
        </button>
      </div>
    </li>
  );
}

export { StoreCartLine };
