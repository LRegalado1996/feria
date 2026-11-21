"use client";

import { useState } from "react";

import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import type { Locale } from "@/lib/i18n/config";
import type { Cart } from "@/lib/schemas/cart";
import type { Currency } from "@/lib/utils/format";

import { useCart } from "./use-cart";
import { type CartProduct, useCartProducts } from "./use-cart-products";

/**
 * Why a line cannot go into the order as it is, or what changed in it;
 * `pending` while the shop's answer for a newly added article is on its way.
 */
export type CartLineFlag = "gone" | "pending" | "price_changed" | "unavailable";

/** One line of the cart, with the article as the shop has it now. */
export interface CartLine {
  flag: CartLineFlag | null;
  item: Cart[number];
  /** `null` until the shop answers for it, and once it is gone. */
  product: CartProduct | null;
}

/**
 * Why the order waits: a line that cannot be bought (`blocked`), the shop's
 * answer on its way (`loading`), or a read that failed (`refresh`).
 */
export type CartHold = "blocked" | "loading" | "refresh";

/**
 * What a cart view shows: nothing known before React reads the browser's
 * cart (`unknown`), the empty cart, a cart waiting for the shop's first
 * answer (`waiting`), or its lines (`shown`).
 */
export type CartLinesStatus = "empty" | "shown" | "unknown" | "waiting";

/**
 * What changed in a line since it was added, if anything. An article the
 * shop's last answer does not name is gone, unless that answer is a
 * placeholder kept on screen while a newer one, which asks for it, loads,
 * or there is no answer to show after a failed read.
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
 * The browser's cart read against the shop (FER-026, FER-045), for the side
 * panel and the checkout page alike: each line with its article as the shop
 * has it now and what changed since it was added, the total of what can be
 * bought, and why the order waits, if it does. Once the shop has answered
 * (or failed to), the view stays laid out (`shown`) while later answers
 * load, so a form beside it keeps what was typed.
 */
export function useCartLines(locale: Locale) {
  const hydrated = useHydrated();
  const { count, items, removeOrdered, setQuantity } = useCart();
  const products = useCartProducts({
    ids: items.map((item) => item.productId),
    locale,
  });
  const answered = products.data !== undefined || products.errorUpdateCount > 0;
  // Sticky for as long as the view is mounted: a line taken out after a
  // failed read asks for a new list with nothing to keep in its place.
  const [laidOut, setLaidOut] = useState(answered);

  if (answered && !laidOut) {
    setLaidOut(true);
  }

  // A read on its way with no answer at all to keep on screen.
  const loadingLines = !products.data && !products.isError;
  const stale = products.isPlaceholderData || !products.data;
  const byId = new Map(
    (products.data ?? []).map((product) => [product.id, product])
  );
  const lines: CartLine[] = items.map((item) => {
    const product = byId.get(item.productId);

    return {
      flag: flagOf(product, item.seenPriceAmount, stale),
      item,
      product: product ?? null,
    };
  });
  let hold: CartHold | null = null;

  // A failed read: the prices shown, if any, are not the shop's word now.
  if (products.isError) {
    hold = "refresh";
  } else if (
    products.isFetching ||
    products.fetchStatus === "paused" ||
    loadingLines ||
    stale
  ) {
    // A refresh on its way (back to the tab, an article that changed under
    // the order, a line added and still pending): the order waits for the
    // shop's word. So does a read that has not started: offline, the query
    // waits without fetching (`paused`), whether or not the shop said
    // something about this list before.
    hold = "loading";
  } else if (
    lines.some((line) => line.flag === "gone" || line.flag === "unavailable")
  ) {
    hold = "blocked";
  }

  // Priced in the shop's currency, from the first article it answered for.
  const [priced] = lines.flatMap(({ product }) => (product ? [product] : []));
  let total: { amount: number; currency: Currency } | null = null;

  if (priced) {
    total = { amount: 0, currency: priced.currencyCode };

    // Sold-out articles are not in the order: their price is not in it.
    for (const { flag, item, product } of lines) {
      if (product && flag !== "unavailable") {
        total.amount += product.priceAmount * item.quantity;
      }
    }
  }

  let status: CartLinesStatus = "shown";

  if (!hydrated) {
    status = "unknown";
  } else if (items.length === 0) {
    status = "empty";
  } else if (!laidOut) {
    status = "waiting";
  }

  return {
    /** How many units in all. */
    count,
    failed: products.isError,
    hold,
    lines,
    /** A read on its way with no earlier answer to keep on screen. */
    loadingLines,
    /** Asks the shop again (a retry, an article that changed). */
    refetch: () => {
      void products.refetch();
    },
    removeOrdered,
    setQuantity,
    status,
    total,
  };
}
