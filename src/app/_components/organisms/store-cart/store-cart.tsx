"use client";

import { CircleAlert, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  type CartLineFlag,
  StoreCartLine,
} from "@/app/_components/molecules/store-cart-line";
import { StoreCheckoutForm } from "@/app/_components/molecules/store-checkout-form";
import { type CartProduct, useCart, useCartProducts } from "@/lib/hooks/cart";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/format";

export interface StoreCartProps {
  className?: string;
  storeSlug: string;
}

/**
 * What changed in a line since it was added, if anything. An article the
 * shop's last answer does not name is gone, unless that answer is the one
 * kept on screen while a newer one, which asks for it, loads, or there is
 * no answer to show after a failed read.
 */
function flagOf(
  product: CartProduct | undefined,
  seenPriceAmount: number | undefined,
  stale: boolean
): CartLineFlag | null {
  if (!product) {
    return stale ? "pending" : "gone";
  }

  if (!product.isAvailable) {
    return "unavailable";
  }

  return seenPriceAmount !== undefined &&
    seenPriceAmount !== product.priceAmount
    ? "price_changed"
    : null;
}

/**
 * A store's cart and its checkout on one page (FER-026), so an order takes
 * one screen and one thumb: the articles at the shop's prices now (read as
 * the page opens), what changed since each was added, the total, and the
 * shopper's details. An article that is gone or sold out holds the order
 * until it is taken out: the server would refuse it anyway.
 */
function StoreCart({ className, storeSlug }: StoreCartProps) {
  const copy = useDictionary().storefront.cart;
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // The last line taken out: where it was, and its name to announce.
  const [removed, setRemoved] = useState<{
    count: number;
    index: number;
    title: string;
  } | null>(null);

  // A removed line takes its focused button with it: focus goes to the
  // line now in its place (or the last one), else to the empty cart's
  // link, else to the heading, never to the top of the document.
  useEffect(() => {
    if (!removed) {
      return;
    }

    const buttons =
      root.current?.querySelectorAll<HTMLElement>("[data-cart-remove]");
    const next =
      buttons && buttons.length > 0
        ? buttons[Math.min(removed.index, buttons.length - 1)]
        : root.current?.querySelector<HTMLElement>(
            '[data-testid="store-cart-empty"] a'
          );

    (next ?? heading.current)?.focus();
  }, [removed]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 text-store-foreground md:py-12",
        className
      )}
      data-slot="store-cart"
      ref={root}
    >
      <h1
        className="font-display store-display-section leading-display tracking-display uppercase outline-none"
        ref={heading}
        tabIndex={-1}
      >
        {copy.title}
      </h1>
      <CartBody
        onRemoved={(index, title) => {
          setRemoved((previous) => ({
            count: (previous?.count ?? 0) + 1,
            index,
            title,
          }));
        }}
        storeSlug={storeSlug}
      />
      <output aria-live="polite" className="sr-only">
        {removed ? interpolate(copy.removed, { title: removed.title }) : ""}
        {/* An invisible mark that alternates, so a repeated message is new. */}
        {removed && removed.count % 2 === 1 ? "\u2060" : null}
      </output>
    </div>
  );
}

/** What the cart holds, from "unknown yet" to the checkout. */
function CartBody({
  onRemoved,
  storeSlug,
}: {
  /** A line was taken out: its place in the list and its name. */
  onRemoved: (index: number, title: string) => void;
  storeSlug: string;
}) {
  const { storefront } = useDictionary();
  const copy = storefront.cart;
  const locale = useLocale();
  const router = useRouter();
  const hydrated = useHydrated();
  const { items, removeOrdered, setQuantity } = useCart(storeSlug);
  const products = useCartProducts({
    ids: items.map((item) => item.productId),
    locale,
    storeSlug,
  });
  const catalogHref = localizePath(`/${storeSlug}/products`, locale);
  // Taken: the ordered articles leave the cart while the order's page
  // loads, which must not read as "your cart is empty". A transition, so the
  // page shown again with the back button starts over, never "sending".
  const [placed, startNavigation] = useTransition();
  const answered = products.data !== undefined || products.errorUpdateCount > 0;
  // Whether the cart's layout has been on screen this visit. A line taken
  // out after a failed read asks for a new list with nothing to keep in its
  // place: the layout stays, so the checkout form keeps what was typed.
  const [laidOut, setLaidOut] = useState(answered);

  if (answered && !laidOut) {
    setLaidOut(true);
  }

  if (placed) {
    return (
      <output className="block font-semibold">
        {copy.checkout.submitting}
      </output>
    );
  }

  // The cart lives in the browser: until React reads it, it is not empty,
  // it is unknown.
  if (!hydrated) {
    return <output className="block text-store-muted">{copy.loading}</output>;
  }

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-start gap-4"
        data-testid="store-cart-empty"
      >
        <ShoppingBag aria-hidden="true" className="size-10 text-store-muted" />
        <p className="text-lg font-semibold">{copy.empty}</p>
        <Link
          className="inline-flex min-h-12 items-center bg-store-contrast px-6 font-semibold text-store-background hover:bg-store-accent hover:text-store-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
          href={catalogHref}
        >
          {copy.continueShopping}
        </Link>
      </div>
    );
  }

  // Nothing to show before the shop's first answer. Once it has come, failed
  // or not, the page stays: the checkout form keeps what the shopper typed,
  // and the lines wait for their prices.
  if (!laidOut) {
    return <output className="block text-store-muted">{copy.loading}</output>;
  }

  // A newer read on its way with no earlier answer to keep on screen.
  const loadingLines = !products.data && !products.isError;

  const shown = products.data ?? [];
  const byId = new Map(shown.map((product) => [product.id, product]));
  const lines = items.map((item) => {
    const product = byId.get(item.productId);

    return {
      flag: flagOf(
        product,
        item.seenPriceAmount,
        products.isPlaceholderData || !products.data
      ),
      item,
      product,
    };
  });
  let blockedReason: string | null = null;

  // A read that failed: the prices shown, if any, are not the shop's word
  // now, so the order waits for one that is.
  if (products.isError) {
    blockedReason = copy.errors.refresh;
  } else if (products.isFetching) {
    // A refresh on its way (back to the tab, an article that changed under
    // the order, a line added and still pending): the lines stay on screen,
    // but the order waits for the shop's word on them.
    blockedReason = copy.loading;
  } else if (
    lines.some((line) => line.flag === "gone" || line.flag === "unavailable")
  ) {
    blockedReason = copy.errors.blocked;
  }

  const [first] = shown;
  let total = 0;

  // Sold-out articles are not in the order: their price is not in its total.
  for (const line of lines) {
    if (line.product && line.flag !== "unavailable") {
      total += line.product.priceAmount * line.item.quantity;
    }
  }

  return (
    <div
      className="grid gap-8 md:grid-cols-[1fr_24rem] md:items-start"
      data-testid="store-cart"
    >
      <section aria-labelledby="store-cart-items">
        <h2 className="sr-only" id="store-cart-items">
          {copy.title}
        </h2>
        {products.isError ? (
          <div
            className="mb-4 flex flex-wrap items-center gap-3 border-2 border-store-contrast p-3"
            role="alert"
          >
            <p className="flex items-center gap-2 font-semibold">
              <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
              {copy.errors.refresh}
            </p>
            <button
              className="inline-flex min-h-11 items-center border-2 border-store-contrast px-4 font-semibold hover:bg-store-contrast hover:text-store-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
              onClick={() => {
                void products.refetch();
              }}
              type="button"
            >
              {copy.errors.retry}
            </button>
          </div>
        ) : null}
        {loadingLines ? (
          <output className="block border-t-2 border-store-line py-4 text-store-muted">
            {copy.loading}
          </output>
        ) : (
          <ul className="border-t-2 border-store-line">
            {lines.map(({ flag, item, product }, index) => (
              <StoreCartLine
                flag={flag}
                key={item.productId}
                onQuantity={(quantity) => {
                  setQuantity(item.productId, quantity);

                  if (quantity <= 0) {
                    onRemoved(index, product?.title ?? copy.flags.goneTitle);
                  }
                }}
                product={product ?? null}
                quantity={item.quantity}
                seenPriceAmount={item.seenPriceAmount}
                storeSlug={storeSlug}
              />
            ))}
          </ul>
        )}
        {first ? (
          <p
            className="flex items-baseline justify-between gap-4 py-4 font-display text-3xl leading-none tracking-display uppercase tabular-nums"
            data-testid="store-cart-total"
          >
            <span>{copy.subtotal}</span>
            <span>{formatPrice(total, first.currencyCode, locale)}</span>
          </p>
        ) : null}
      </section>
      <StoreCheckoutForm
        blockedReason={blockedReason}
        items={items.map(({ productId, quantity }) => ({
          productId,
          quantity,
        }))}
        onPlaced={(token, ordered) => {
          startNavigation(() => {
            router.push(localizePath(`/${storeSlug}/orders/${token}`, locale));
          });
          removeOrdered(ordered);
        }}
        onStale={() => {
          void products.refetch();
        }}
        storeSlug={storeSlug}
      />
    </div>
  );
}

export { StoreCart };
