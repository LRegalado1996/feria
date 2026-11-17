"use client";

import { CircleAlert, ImageOff, Minus, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import type { Dictionary } from "@/content";
import { articlePath } from "@/lib/catalog/paths";
import type { CartLineFlag, CartProduct } from "@/lib/hooks/cart";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { CART_QUANTITY_MAX } from "@/lib/schemas/cart";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/format";

interface LineBase {
  className?: string;
  flag: CartLineFlag | null;
  /** The article as the shop has it now; `null` until then, or once gone. */
  product: CartProduct | null;
  quantity: number;
  /** What the shopper saw when adding it, for a price that changed. */
  seenPriceAmount: number | undefined;
}

/** In the side panel: the quantity in a stepper and a way to take it out. */
interface PanelLine extends LineBase {
  /**
   * Just added, the reason the panel opened: the line rises into place
   * under a lime wash that fades (FER-045). Not under reduced motion.
   */
  justAdded?: boolean;
  /** Called with the new quantity; 0 takes the article out. */
  onQuantity: (quantity: number) => void;
  variant?: "panel";
}

/** On the checkout page: what is ordered, read only, and what it costs. */
interface SummaryLine extends LineBase {
  variant: "summary";
}

export type StoreCartLineProps = PanelLine | SummaryLine;

type CartCopy = Dictionary["storefront"]["cart"];

/** The article's name, as a card sets it: the display face, small. */
const NAME_CLASS =
  "font-display text-xs leading-tight font-extrabold wrap-anywhere uppercase";

/**
 * The photo on the grey tile, dimmed when it cannot go into the order; the
 * bare tile while the article is on its way, never "no photo" before the
 * shop has said so.
 */
function Tile({
  blocked,
  pending,
  product,
  summary,
}: {
  blocked: boolean;
  pending: boolean;
  product: CartProduct | null;
  summary: boolean;
}) {
  let photo: ReactNode = (
    <ImageOff
      aria-hidden="true"
      className="absolute inset-0 m-auto size-6 text-store-muted"
    />
  );

  if (pending) {
    photo = null;
  } else if (product?.cover) {
    photo = (
      <Image
        alt=""
        className={cn("object-cover", blocked && "opacity-50")}
        fill
        sizes={summary ? "64px" : "96px"}
        src={product.cover.url}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative bg-store-surface",
        summary ? "size-16" : "row-span-2 size-24"
      )}
      data-slot="store-cart-line-tile"
    >
      {photo}
    </div>
  );
}

/**
 * The line's name: a link to the article, the shape of a name while the
 * shop's answer comes, or what is left of an article that is gone.
 */
function LineName({
  copy,
  flag,
  locale,
  product,
}: {
  copy: CartCopy;
  flag: CartLineFlag | null;
  locale: Locale;
  product: CartProduct | null;
}) {
  if (flag === "pending") {
    return (
      <>
        <span className="sr-only">{copy.loading}</span>
        <span aria-hidden="true" className="h-3 w-3/4 bg-store-surface" />
        <span aria-hidden="true" className="h-3 w-1/3 bg-store-surface" />
      </>
    );
  }

  if (!product) {
    return (
      <p className={cn(NAME_CLASS, "text-store-muted")}>
        {copy.flags.goneTitle}
      </p>
    );
  }

  return (
    <Link
      className={cn(
        NAME_CLASS,
        "self-start text-store-foreground underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
      )}
      href={localizePath(articlePath(product.slug), locale)}
      lang={product.lang}
    >
      {product.title}
    </Link>
  );
}

/** What changed in a line since it was added, in words; `null` for nothing. */
function noticeOf(
  { flag, product, seenPriceAmount }: LineBase,
  copy: CartCopy,
  locale: Locale
): string | null {
  // A gone line's title already says it is gone.
  if (flag === "unavailable") {
    return copy.flags.unavailable;
  }

  if (flag === "price_changed" && product && seenPriceAmount !== undefined) {
    return interpolate(copy.flags.priceChanged, {
      before: formatPrice(seenPriceAmount, product.currencyCode, locale),
    });
  }

  return null;
}

/** The pill stepper and the remove button of a line in the side panel. */
function PanelControls({
  blocked,
  copy,
  onQuantity,
  quantity,
  title,
}: {
  blocked: boolean;
  copy: CartCopy;
  onQuantity: (quantity: number) => void;
  quantity: number;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      {blocked ? (
        <span />
      ) : (
        // A pill around the two steps and the count, as the article's page
        // draws it.
        <fieldset className="inline-flex items-center rounded-full border-2 border-store-foreground">
          <legend className="sr-only">
            {interpolate(copy.quantity, { title })}
          </legend>
          {/* `aria-disabled`, not `disabled`: a button that disables itself
              under the finger drops keyboard focus. */}
          <StoreButton
            aria-disabled={quantity <= 1}
            onClick={() => {
              if (quantity > 1) {
                onQuantity(quantity - 1);
              }
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Minus aria-hidden="true" className="size-4" />
            <span className="sr-only">
              {interpolate(copy.decrease, { title })}
            </span>
          </StoreButton>
          <output
            aria-live="polite"
            className="inline-flex h-11 min-w-8 items-center justify-center text-base font-semibold tabular-nums"
            data-testid="store-cart-quantity"
          >
            {quantity}
          </output>
          <StoreButton
            aria-disabled={quantity >= CART_QUANTITY_MAX}
            onClick={() => {
              if (quantity < CART_QUANTITY_MAX) {
                onQuantity(quantity + 1);
              }
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Plus aria-hidden="true" className="size-4" />
            <span className="sr-only">
              {interpolate(copy.increase, { title })}
            </span>
          </StoreButton>
        </fieldset>
      )}
      <StoreButton
        data-cart-remove=""
        onClick={() => {
          onQuantity(0);
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        <span className="sr-only">{interpolate(copy.remove, { title })}</span>
      </StoreButton>
    </div>
  );
}

/**
 * The line's words: its name, its price (each in the panel, how many at
 * what price in the summary), and what changed since it was added.
 */
function LineDetails({
  copy,
  flag,
  locale,
  notice,
  priced,
  product,
  quantity,
  summary,
}: {
  copy: CartCopy;
  flag: CartLineFlag | null;
  locale: Locale;
  notice: string | null;
  /** The article when it can be bought, at its price; else `null`. */
  priced: CartProduct | null;
  product: CartProduct | null;
  quantity: number;
  summary: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <LineName copy={copy} flag={flag} locale={locale} product={product} />
      {priced ? (
        <p
          className="text-sm text-store-muted tabular-nums"
          data-testid="store-cart-line-price"
        >
          {interpolate(summary ? copy.page.lineQuantity : copy.unitPrice, {
            price: formatPrice(priced.priceAmount, priced.currencyCode, locale),
            quantity,
          })}
        </p>
      ) : null}
      {/* Mounted always, so a notice a refresh brings is announced: a live
          region added together with its text is often not read. Empty, it
          is `sr-only`, out of the column's flow and its gap. */}
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
  );
}

/**
 * One article in the cart (FER-026, FER-045): its photo on the grey tile,
 * its name and price as the shop has them now, and what changed since it
 * was added. In the side panel (`panel`) its quantity is a pill stepper and
 * it can be taken out; a line that is gone or sold out can only be taken
 * out. On the checkout page (`summary`) it is read only: how many at what
 * price, and what they come to. A line whose article is on its way is a
 * placeholder the shape of a line.
 */
function StoreCartLine(props: StoreCartLineProps) {
  const { className, flag, product, quantity } = props;
  const copy = useDictionary().storefront.cart;
  const locale = useLocale();
  const summary = props.variant === "summary";
  const justAdded = !summary && props.justAdded === true && product !== null;
  const blocked = flag !== null && flag !== "price_changed";
  // What can be bought, at what price; nothing for what cannot.
  const priced = product && !blocked ? product : null;
  const details = (
    <LineDetails
      copy={copy}
      flag={flag}
      locale={locale}
      notice={noticeOf(props, copy, locale)}
      priced={priced}
      product={product}
      quantity={quantity}
      summary={summary}
    />
  );

  return (
    <li
      aria-busy={flag === "pending" ? true : undefined}
      className={cn(
        "relative isolate border-b border-store-line",
        summary ? "py-4" : "px-4 py-5 md:px-6",
        className
      )}
      data-flag={flag ?? undefined}
      data-just-added={justAdded ? "" : undefined}
      data-slot="store-cart-line"
      data-testid="store-cart-line"
      data-variant={summary ? "summary" : "panel"}
    >
      {justAdded ? (
        // A lime wash over the line, held a moment and gone.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-store-accent/30 motion-safe:animate-store-wash motion-reduce:hidden"
          data-slot="store-cart-line-wash"
          data-testid="store-cart-line-wash"
        />
      ) : null}
      {summary ? (
        <div className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-start gap-x-4">
          <Tile
            blocked={blocked}
            pending={flag === "pending"}
            product={product}
            summary
          />
          {details}
          {priced ? (
            <p
              className="text-sm font-semibold tabular-nums"
              data-testid="store-cart-line-total"
            >
              {formatPrice(
                priced.priceAmount * quantity,
                priced.currencyCode,
                locale
              )}
            </p>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            "grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-3",
            // The class comes with the article, so the rise starts with
            // what the line shows; the line itself is never drawn anew,
            // which would drop the focus of a control inside it.
            justAdded && "motion-safe:animate-store-rise"
          )}
          data-testid="store-cart-line-body"
        >
          <Tile
            blocked={blocked}
            pending={flag === "pending"}
            product={product}
            summary={false}
          />
          {details}
          <PanelControls
            blocked={blocked}
            copy={copy}
            onQuantity={props.onQuantity}
            quantity={quantity}
            title={
              product?.title ??
              (flag === "pending" ? copy.loading : copy.flags.goneTitle)
            }
          />
        </div>
      )}
    </li>
  );
}

export { StoreCartLine };
