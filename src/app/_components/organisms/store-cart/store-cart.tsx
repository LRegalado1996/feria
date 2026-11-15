"use client";

import { CircleAlert, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  type CartLineFlag,
  StoreCartLine,
} from "@/app/_components/molecules/store-cart-line";
import { StoreCheckoutForm } from "@/app/_components/molecules/store-checkout-form";
import { type CartProduct, useCart, useCartProducts } from "@/lib/hooks/cart";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/format";

export interface StoreCartProps {
  className?: string;
  storeSlug: string;
}

/** What changed in a line since it was added, if anything. */
function flagOf(
  product: CartProduct | undefined,
  seenPriceAmount: number | undefined
): CartLineFlag | null {
  if (!product) {
    return "gone";
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

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 text-store-foreground md:py-12",
        className
      )}
      data-slot="store-cart"
    >
      <h1 className="font-display store-display-section leading-display tracking-display uppercase">
        {copy.title}
      </h1>
      <CartBody storeSlug={storeSlug} />
    </div>
  );
}

/** What the cart holds, from "unknown yet" to the checkout. */
function CartBody({ storeSlug }: { storeSlug: string }) {
  const { storefront } = useDictionary();
  const copy = storefront.cart;
  const locale = useLocale();
  const router = useRouter();
  const hydrated = useHydrated();
  const { clear, items, setQuantity } = useCart(storeSlug);
  const products = useCartProducts({
    ids: items.map((item) => item.productId),
    locale,
    storeSlug,
  });
  const catalogHref = localizePath(`/${storeSlug}/products`, locale);
  // Taken: the cart is cleared while the order's page loads, which must not
  // read as "your cart is empty".
  const [placed, setPlaced] = useState(false);

  // Next keeps a page it left mounted, hidden, for the back button: hiding
  // runs this cleanup, so a shopper who goes back from the order's page
  // finds the (now empty) cart instead of "sending" forever.
  useEffect(
    () => () => {
      setPlaced(false);
    },
    []
  );

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

  if (products.isError && !products.data) {
    return (
      <div className="flex flex-col items-start gap-3" role="alert">
        <p className="flex items-center gap-2 font-semibold">
          <CircleAlert aria-hidden="true" className="size-5" />
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
    );
  }

  if (!products.data) {
    return <output className="block text-store-muted">{copy.loading}</output>;
  }

  const byId = new Map(products.data.map((product) => [product.id, product]));
  const lines = items.map((item) => {
    const product = byId.get(item.productId);

    return { flag: flagOf(product, item.seenPriceAmount), item, product };
  });
  const blocked = lines.some(
    (line) => line.flag === "gone" || line.flag === "unavailable"
  );
  const [first] = products.data;
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
        <ul className="border-t-2 border-store-line">
          {lines.map(({ flag, item, product }) => (
            <StoreCartLine
              flag={flag}
              key={item.productId}
              onQuantity={(quantity) => {
                setQuantity(item.productId, quantity);
              }}
              product={product ?? null}
              quantity={item.quantity}
              seenPriceAmount={item.seenPriceAmount}
              storeSlug={storeSlug}
            />
          ))}
        </ul>
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
        blockedReason={blocked ? copy.errors.blocked : null}
        items={items.map(({ productId, quantity }) => ({
          productId,
          quantity,
        }))}
        onPlaced={(token) => {
          setPlaced(true);
          router.push(localizePath(`/${storeSlug}/orders/${token}`, locale));
          clear();
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
