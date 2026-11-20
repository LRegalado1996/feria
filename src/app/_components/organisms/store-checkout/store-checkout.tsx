"use client";

import { CircleAlert, Pencil, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { StoreCartLine } from "@/app/_components/molecules/store-cart-line";
import { StoreCheckoutForm } from "@/app/_components/molecules/store-checkout-form";
import type { Dictionary } from "@/content";
import { ALL_ARTICLES_PATH } from "@/lib/catalog/paths";
import { type CartHold, useCartLines, useCartPanel } from "@/lib/hooks/cart";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/format";

export interface StoreCheckoutProps {
  className?: string;
}

/** What the cart's hold says under the order's button. */
function holdReason(
  hold: CartHold | null,
  copy: Dictionary["storefront"]["cart"]
): string | null {
  const reasons: Record<CartHold, string> = {
    blocked: copy.errors.blocked,
    loading: copy.loading,
    refresh: copy.errors.refresh,
  };

  return hold ? reasons[hold] : null;
}

/** What the cart holds, from "unknown yet" to the form. */
function CheckoutBody() {
  const { storefront } = useDictionary();
  const copy = storefront.cart;
  const locale = useLocale();
  const router = useRouter();
  const panel = useCartPanel();
  const cart = useCartLines(locale);
  // Taken: the ordered articles leave the cart while the order's page
  // loads, which must not read as "your cart is empty". A transition, so the
  // page shown again with the back button starts over, never "sending".
  const [placed, startNavigation] = useTransition();

  if (placed) {
    return (
      <output className="block font-semibold">
        {copy.checkout.submitting}
      </output>
    );
  }

  if (cart.status === "empty") {
    return (
      <div
        className="flex flex-col items-start gap-4"
        data-testid="store-checkout-empty"
      >
        <ShoppingBag aria-hidden="true" className="size-10 text-store-muted" />
        <p className="text-lg font-semibold">{copy.empty}</p>
        {/* The empty cart's one way on: the primary pill. */}
        <StoreButton asChild size="lg">
          <Link href={localizePath(ALL_ARTICLES_PATH, locale)}>
            {copy.browse}
          </Link>
        </StoreButton>
      </div>
    );
  }

  // The cart lives in the browser: until React reads it, it is not empty,
  // it is unknown. Then nothing to show before the shop's first answer.
  // Once it has come, failed or not, the page stays: the form keeps what
  // the shopper typed, and the lines wait for their prices.
  if (cart.status !== "shown") {
    return <output className="block text-store-muted">{copy.loading}</output>;
  }

  return (
    <div
      className="grid gap-8 md:grid-cols-[minmax(0,1fr)_24rem] md:items-start"
      data-testid="store-checkout"
    >
      <section aria-labelledby="store-checkout-summary">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-store-foreground pb-3">
          <h2
            className="font-display store-display-section leading-display font-extrabold uppercase"
            id="store-checkout-summary"
          >
            {copy.page.summary}
          </h2>
          {/* The quantities are changed in the side panel, over this page. */}
          {panel ? (
            <StoreButton
              data-testid="store-checkout-edit"
              onClick={(event) => {
                panel.open({ returnFocus: event.currentTarget });
              }}
              type="button"
              variant="outline"
            >
              <Pencil aria-hidden="true" />
              {copy.page.edit}
            </StoreButton>
          ) : null}
        </div>
        {cart.failed ? (
          <div
            className="mt-4 flex flex-wrap items-center gap-3 border-2 border-store-foreground p-3"
            role="alert"
          >
            <p className="flex items-center gap-2 font-semibold">
              <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
              {copy.errors.refresh}
            </p>
            <StoreButton
              onClick={() => {
                cart.refetch();
              }}
              type="button"
              variant="outline"
            >
              {copy.errors.retry}
            </StoreButton>
          </div>
        ) : null}
        <ul>
          {cart.lines.map(({ flag, item, product }) => (
            <StoreCartLine
              flag={flag}
              key={item.productId}
              product={product}
              quantity={item.quantity}
              seenPriceAmount={item.seenPriceAmount}
              variant="summary"
            />
          ))}
        </ul>
        {cart.total ? (
          <p
            className="flex items-baseline justify-between gap-4 py-5"
            data-testid="store-checkout-total"
          >
            <span className="font-display text-sm leading-tight font-extrabold uppercase">
              {copy.subtotal}
            </span>
            <span className="text-xl font-semibold tabular-nums">
              {formatPrice(cart.total.amount, cart.total.currency, locale)}
            </span>
          </p>
        ) : null}
      </section>
      <StoreCheckoutForm
        blockedReason={holdReason(cart.hold, copy)}
        items={cart.lines.map(({ item }) => ({
          productId: item.productId,
          quantity: item.quantity,
        }))}
        onPlaced={(token, ordered) => {
          startNavigation(() => {
            router.push(localizePath(`/orders/${token}`, locale));
          });
          cart.removeOrdered(ordered);
        }}
        onStale={() => {
          cart.refetch();
        }}
        total={cart.total}
      />
    </div>
  );
}

/**
 * The checkout (FER-026, FER-045), the page "Hacer el pedido" leads to from
 * the cart's side panel: the order's summary, read only, with the articles
 * at the shop's prices now (read as the page opens), what changed since
 * each was added and the total, then the shopper's details. "Editar el
 * carrito" opens the side panel over the page to change it. An article
 * that is gone or sold out holds the order until it is taken out there: the
 * server would refuse it anyway.
 */
function StoreCheckout({ className }: StoreCheckoutProps) {
  const copy = useDictionary().storefront.cart;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-8 px-4 py-8 text-store-foreground md:px-7 md:py-14",
        className
      )}
      data-slot="store-checkout"
    >
      <h1 className="font-display store-display-page leading-display font-extrabold uppercase">
        {copy.page.title}
      </h1>
      <CheckoutBody />
    </div>
  );
}

export { StoreCheckout };
