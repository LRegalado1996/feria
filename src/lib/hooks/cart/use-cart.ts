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

// `undefined` until first asked; `null` once the browser refused it.
let storage: Storage | null | undefined;

// Where a cart lives when storage refused it or could not hold it: in this
// page only, gone when the page is left, but a cart all the same.
const memory = new Map<string, string>();

// Tabs of the same store share the cart: a write here is announced to this
// tab's subscribers, and the browser's `storage` event tells the others.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  // Another tab wrote this cart to storage: a copy this page kept after a
  // failed write is older than it, and would bring cleared articles back.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null) {
      memory.delete(event.key);
    }

    listener();
  };

  listeners.add(listener);
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The browser's storage, opened once. A browser that blocks site data
 * throws on the first touch: that is reported once, and carts then live in
 * the page's memory.
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
  return memory.get(key) ?? cartStorage()?.getItem(key) ?? null;
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

/**
 * Saves a cart, or refuses one that would not parse back (a bad quantity
 * would otherwise empty the whole cart on the next read). Answers whether
 * it was saved.
 */
function write(key: string, cart: Cart): boolean {
  if (!cartSchema.safeParse(cart).success) {
    return false;
  }

  const text = JSON.stringify(cart);
  const browserStorage = cartStorage();

  if (browserStorage) {
    try {
      browserStorage.setItem(key, text);
      memory.delete(key);
    } catch (error) {
      // Full or refused: the cart lives in the page until it is left.
      reportError(error, { action: "Cart.write_storage" });
      memory.set(key, text);
    }
  } else {
    memory.set(key, text);
  }

  for (const listener of listeners) {
    listener();
  }

  return true;
}

/**
 * A store's cart in this browser (FER-021): the articles and their
 * quantities, how many units in all, and the changes FER-024 and FER-026
 * make. Empty before hydration; where storage is refused, it lives in the
 * page until the page is left.
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
   * Adds `quantity` of an article, up to the per-article cap. Answers
   * `false`, changing nothing, for a new article past the cart's cap of
   * articles or an id or quantity that is not a positive whole number.
   */
  const add = useCallback(
    (productId: number, quantity = 1): boolean => {
      const current = parseCart(readRaw(key));
      const line = current.find((item) => item.productId === productId);

      // Checked before the cap: capped first, 10.5 or Infinity would become
      // a valid 10.
      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        (!line && current.length >= CART_ITEMS_MAX)
      ) {
        return false;
      }

      return write(
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
    },
    [key]
  );

  /**
   * Sets an article's quantity; 0 or less takes it out. Answers `false`,
   * changing nothing, for a quantity that is not a whole number.
   */
  const setQuantity = useCallback(
    (productId: number, quantity: number): boolean => {
      if (!Number.isInteger(quantity)) {
        return false;
      }

      const current = parseCart(readRaw(key));

      return write(
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
