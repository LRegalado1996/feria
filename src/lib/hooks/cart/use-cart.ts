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

/**
 * What adding did: `added`, or why nothing was: the article is already at
 * its cap of units, the cart at its cap of articles, or the id or quantity
 * is not a positive whole number.
 */
export type AddOutcome = "added" | "at_max" | "cart_full" | "refused";

/** Where the cart lives in the browser: one per browser (FER-038). */
export const CART_STORAGE_KEY = "feria:cart";

// `undefined` until first asked; `null` once the browser refused it.
let storage: Storage | null | undefined;

// The cart's text when storage refused it or could not hold it: kept in this
// page only, gone when the page is left, but a cart all the same.
let memory: string | undefined;

// Tabs share the cart: a write here is announced to this tab's subscribers,
// and the browser's `storage` event tells the others.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  // Another tab wrote the cart to storage: a copy this page kept after a
  // failed write is older than it, and would bring cleared articles back.
  const onStorage = (event: StorageEvent) => {
    // Without a readable storage the page's copy is the only one there is.
    if (event.key === CART_STORAGE_KEY && storage) {
      memory = undefined;
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
 * throws on the first touch: that is reported once, and the cart then lives
 * in the page's memory.
 */
function cartStorage(): Storage | null {
  if (storage === undefined) {
    try {
      storage = window.localStorage;
      storage.getItem(CART_STORAGE_KEY);
    } catch (error) {
      reportError(error, { action: "Cart.open_storage" });
      storage = null;
    }
  }

  return storage;
}

// The last text read from storage, kept for the moment a later read throws:
// the page carries on with it instead of an empty cart.
let lastRead: string | undefined;

/** The raw stored text, the snapshot React compares between renders. */
function readRaw(): string | null {
  if (memory !== undefined) {
    return memory;
  }

  const browserStorage = cartStorage();

  if (!browserStorage) {
    return null;
  }

  try {
    const raw = browserStorage.getItem(CART_STORAGE_KEY);
    lastRead = raw ?? undefined;

    return raw;
  } catch (error) {
    // Storage opened, but a later read threw (Firefox does once site data
    // goes away mid-visit): reported once, and from then on the cart lives
    // in the page, starting from what it last read.
    reportError(error, { action: "Cart.read_storage" });
    storage = null;
    memory = lastRead;

    return memory ?? null;
  }
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
 * The cart as stored at this moment, past React's last render: a tab that
 * changed it a moment ago is seen before this one renders again.
 */
export function readCart(): Cart {
  return parseCart(readRaw());
}

/**
 * Saves a cart, or refuses one that would not parse back (a bad quantity
 * would otherwise empty the whole cart on the next read). Answers whether
 * it was saved.
 */
function write(cart: Cart): boolean {
  if (!cartSchema.safeParse(cart).success) {
    return false;
  }

  const text = JSON.stringify(cart);
  const browserStorage = cartStorage();

  if (browserStorage) {
    try {
      browserStorage.setItem(CART_STORAGE_KEY, text);
      memory = undefined;
      lastRead = text;
    } catch (error) {
      // Full or refused: the cart lives in the page until it is left.
      reportError(error, { action: "Cart.write_storage" });
      memory = text;
    }
  } else {
    memory = text;
  }

  for (const listener of listeners) {
    listener();
  }

  return true;
}

/**
 * The cart in this browser (FER-021): the articles and their quantities, how
 * many units in all, and the changes FER-024 and FER-026 make. Empty before
 * hydration; where storage is refused, it lives in the page until the page
 * is left.
 */
export function useCart() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const items = useMemo(() => parseCart(raw), [raw]);

  /**
   * Adds `quantity` of an article, up to the per-article cap, and answers
   * what it did (`AddOutcome`); anything but `added` changed nothing.
   * `seenPriceAmount` is the price the page showed, kept so the cart can
   * say when it changed since.
   */
  const add = useCallback(
    (productId: number, quantity = 1, seenPriceAmount?: number): AddOutcome => {
      const seen = seenPriceAmount === undefined ? {} : { seenPriceAmount };
      const current = parseCart(readRaw());
      const line = current.find((item) => item.productId === productId);

      // Checked before the cap: capped first, 10.5 or Infinity would become
      // a valid 10.
      if (!Number.isInteger(quantity) || quantity < 1) {
        return "refused";
      }

      // Never clamped in silence: an article already at its cap is said so.
      if (line && line.quantity >= CART_QUANTITY_MAX) {
        return "at_max";
      }

      if (!line && current.length >= CART_ITEMS_MAX) {
        return "cart_full";
      }

      const saved = write(
        line
          ? current.map((item) =>
              item.productId === productId
                ? {
                    ...item,
                    ...seen,
                    quantity: Math.min(
                      item.quantity + quantity,
                      CART_QUANTITY_MAX
                    ),
                  }
                : item
            )
          : [
              ...current,
              {
                productId,
                quantity: Math.min(quantity, CART_QUANTITY_MAX),
                ...seen,
              },
            ]
      );

      return saved ? "added" : "refused";
    },
    []
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

      const current = parseCart(readRaw());

      return write(
        quantity <= 0
          ? current.filter((item) => item.productId !== productId)
          : current.map((item) =>
              item.productId === productId
                ? { ...item, quantity: Math.min(quantity, CART_QUANTITY_MAX) }
                : item
            )
      );
    },
    []
  );

  const clear = useCallback(() => {
    write(EMPTY);
  }, []);

  /**
   * After an order (FER-026): takes out what it ordered, and keeps what was
   * added meanwhile, in this tab or another, while it was being sent.
   */
  const removeOrdered = useCallback(
    (ordered: { productId: number; quantity: number }[]) => {
      const taken = new Map(
        ordered.map((item) => [item.productId, item.quantity])
      );

      write(
        parseCart(readRaw()).flatMap((item) => {
          const left = item.quantity - (taken.get(item.productId) ?? 0);

          return left > 0 ? [{ ...item, quantity: left }] : [];
        })
      );
    },
    []
  );

  return {
    add,
    clear,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    removeOrdered,
    setQuantity,
  };
}
