"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { reportError } from "@/lib/errors/client";
import {
  type Cart,
  CART_ITEMS_MAX,
  CART_QUANTITY_MAX,
  cartSchema,
} from "@/lib/schemas/cart";

const EMPTY: Cart = [];

/** Where a store's cart lives in the browser: one per store. */
export function cartStorageKey(storeSlug: string) {
  return `feria:cart:${storeSlug}`;
}

// Tabs of the same store share the cart: a write here is announced to this
// tab's subscribers, and the browser's `storage` event tells the others.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

// `undefined` until first asked; `null` once the browser refused it.
let storage: Storage | null | undefined;

/**
 * The browser's storage, opened once. A browser that blocks site data
 * throws on the first touch: that is reported once, and the cart then
 * lives only as long as the page.
 */
function cartStorage(): Storage | null {
  if (storage === undefined) {
    try {
      storage = window.localStorage;
      storage.getItem(cartStorageKey(""));
    } catch (error) {
      reportError(error, { action: "Cart.open_storage" });
      storage = null;
    }
  }

  return storage;
}

/** The raw stored text, the snapshot React compares between renders. */
function readRaw(key: string): string | null {
  return cartStorage()?.getItem(key) ?? null;
}

/** The stored cart, or an empty one when it is missing or does not parse. */
export function parseCart(raw: string | null): Cart {
  if (raw === null) {
    return EMPTY;
  }

  try {
    const parsed = cartSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY;
  } catch (error) {
    // Not JSON at all: the same as a cart that does not parse.
    reportError(error, { action: "Cart.parse_storage" });
    return EMPTY;
  }
}

function write(key: string, cart: Cart) {
  try {
    cartStorage()?.setItem(key, JSON.stringify(cart));
  } catch (error) {
    // Full or refused: the cart lives only until the page is left.
    reportError(error, { action: "Cart.write_storage" });
  }

  for (const listener of listeners) {
    listener();
  }
}

/**
 * A store's cart in this browser (FER-021): the articles and their
 * quantities, how many units in all, and the changes FER-024 and FER-026
 * make. Before hydration, and where storage is refused, it is empty.
 */
export function useCart(storeSlug: string) {
  const key = cartStorageKey(storeSlug);
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null
  );
  const items = useMemo(() => parseCart(raw), [raw]);

  /**
   * Adds `quantity` of an article, up to the per-article cap; a new article
   * past the cart's cap of articles is not added (the answer says so).
   */
  const add = useCallback(
    (productId: number, quantity = 1): boolean => {
      const current = parseCart(readRaw(key));
      const line = current.find((item) => item.productId === productId);

      if (!line && current.length >= CART_ITEMS_MAX) {
        return false;
      }

      write(
        key,
        line
          ? current.map((item) =>
              item.productId === productId
                ? {
                    ...item,
                    quantity: Math.min(
                      item.quantity + quantity,
                      CART_QUANTITY_MAX
                    ),
                  }
                : item
            )
          : [
              ...current,
              { productId, quantity: Math.min(quantity, CART_QUANTITY_MAX) },
            ]
      );

      return true;
    },
    [key]
  );

  /** Sets an article's quantity; 0 or less takes it out. */
  const setQuantity = useCallback(
    (productId: number, quantity: number) => {
      const current = parseCart(readRaw(key));

      write(
        key,
        quantity <= 0
          ? current.filter((item) => item.productId !== productId)
          : current.map((item) =>
              item.productId === productId
                ? { ...item, quantity: Math.min(quantity, CART_QUANTITY_MAX) }
                : item
            )
      );
    },
    [key]
  );

  const clear = useCallback(() => {
    write(key, EMPTY);
  }, [key]);

  return {
    add,
    clear,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    setQuantity,
  };
}
