import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { AddResult, useCart as UseCart } from "./use-cart";

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("@/lib/errors/client", () => ({ reportError }));

const KEY = "feria:cart";

function makeItem(productId: number, quantity = 1) {
  return { productId, quantity };
}

/** `count` distinct articles, one unit each. */
function makeCart(count: number) {
  return Array.from({ length: count }, (_, index) => makeItem(index + 1));
}

interface SetupOptions {
  /** Writing throws, as a full storage does. */
  full?: boolean;
  /**
   * The browser refuses storage: reaching `localStorage` throws, or its
   * first read does.
   */
  refused?: "getter" | "read" | false;
  /** The text already stored under the cart's key; `null` for none. */
  stored?: string | null;
}

/** A storage over a map, whose reads or writes can throw like a browser's. */
function makeStorage({ full = false, refusesReads = false } = {}) {
  const map = new Map<string, string>();
  const refusal = () =>
    new DOMException("The operation is insecure.", "SecurityError");

  return {
    clear: () => {
      map.clear();
    },
    getItem: vi.fn((key: string) => {
      if (refusesReads) {
        throw refusal();
      }

      return map.get(key) ?? null;
    }),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: vi.fn((key: string, value: string) => {
      if (full) {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }

      map.set(key, value);
    }),
  } satisfies Storage;
}

/**
 * A fresh copy of the module each time: it keeps the opened storage across
 * renders, so a test never inherits another's.
 */
async function setup({
  full = false,
  refused = false,
  stored = null,
}: SetupOptions = {}) {
  const storage = makeStorage({ full, refusesReads: refused === "read" });

  if (stored !== null) {
    storage.setItem(KEY, stored);
  }

  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    if (refused === "getter") {
      throw new DOMException("The operation is insecure.", "SecurityError");
    }

    return storage;
  });

  vi.resetModules();
  const cart = await import("./use-cart");
  const { result, unmount } = renderHook(() => cart.useCart());

  return {
    cart,
    result,
    storage,
    unmount,
    storedCart: (): unknown => JSON.parse(storage.getItem(KEY) ?? "null"),
  };
}

type CartApi = ReturnType<typeof UseCart>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCart", () => {
  test("keeps one cart for the whole browser, under one key", async () => {
    const { cart, result, storage } = await setup();

    act(() => {
      result.current.add(4);
    });

    expect(cart.CART_STORAGE_KEY).toBe("feria:cart");
    expect(JSON.parse(storage.getItem("feria:cart") ?? "null")).toEqual([
      makeItem(4, 1),
    ]);
  });

  test("starts empty with nothing stored", async () => {
    const { result } = await setup();

    expect(result.current.items).toEqual([]);
    expect(result.current.count).toBe(0);
  });

  test("reads the stored cart and counts its units", async () => {
    const { result } = await setup({
      stored: JSON.stringify([makeItem(4, 2), makeItem(9, 3)]),
    });

    expect(result.current.items).toEqual([makeItem(4, 2), makeItem(9, 3)]);
    expect(result.current.count).toBe(5);
  });

  test("adds a new article as a line of its own, stored", async () => {
    const { result, storedCart } = await setup({
      stored: JSON.stringify([makeItem(4, 2)]),
    });

    let outcome: AddResult | null = null;
    act(() => {
      outcome = result.current.add(9);
    });

    expect(outcome).toEqual({ added: 1, outcome: "added" });
    expect(result.current.items).toEqual([makeItem(4, 2), makeItem(9, 1)]);
    expect(storedCart()).toEqual([makeItem(4, 2), makeItem(9, 1)]);
  });

  test.each([
    ["adds to an existing line", 3, 2, 5, 2],
    ["caps an existing line at 10, counting the units it took", 8, 5, 10, 2],
    ["reaches exactly 10", 7, 3, 10, 3],
  ])("%s", async (_case, start, asked, expected, took) => {
    const { result } = await setup({
      stored: JSON.stringify([makeItem(4, start)]),
    });

    let outcome: AddResult | null = null;
    act(() => {
      outcome = result.current.add(4, asked);
    });

    expect(outcome).toEqual({ added: took, outcome: "added" });
    expect(result.current.items).toEqual([makeItem(4, expected)]);
  });

  test.each([
    ["adding one", 1],
    ["adding several", 3],
  ])(
    "says an article already at 10 is at its maximum when %s, changing nothing",
    async (_case, quantity) => {
      const { result, storage, storedCart } = await setup({
        stored: JSON.stringify([makeItem(4, 10)]),
      });
      storage.setItem.mockClear();

      let outcome: AddResult | null = null;
      act(() => {
        outcome = result.current.add(4, quantity);
      });

      expect(outcome).toEqual({ added: 0, outcome: "at_max" });
      expect(storedCart()).toEqual([makeItem(4, 10)]);
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  );

  test("keeps the price seen on a new line", async () => {
    const { result, storedCart } = await setup({
      stored: JSON.stringify([makeItem(4, 2)]),
    });

    act(() => {
      result.current.add(9, 1, 125_000);
    });

    expect(storedCart()).toEqual([
      makeItem(4, 2),
      { ...makeItem(9, 1), seenPriceAmount: 125_000 },
    ]);
    expect(result.current.items).toEqual([
      makeItem(4, 2),
      { ...makeItem(9, 1), seenPriceAmount: 125_000 },
    ]);
  });

  test.each([
    ["a line with a price seen before", { seenPriceAmount: 100_000 }],
    ["a line with no price seen", {}],
  ])("takes the price seen now on %s", async (_case, seen) => {
    const { storedCart, result } = await setup({
      stored: JSON.stringify([{ ...makeItem(4, 2), ...seen }]),
    });

    act(() => {
      result.current.add(4, 1, 125_000);
    });

    expect(storedCart()).toEqual([
      { ...makeItem(4, 3), seenPriceAmount: 125_000 },
    ]);
  });

  test("leaves the price seen alone when none is given", async () => {
    const { storedCart, result } = await setup({
      stored: JSON.stringify([{ ...makeItem(4, 2), seenPriceAmount: 100_000 }]),
    });

    act(() => {
      result.current.add(4);
    });

    expect(storedCart()).toEqual([
      { ...makeItem(4, 3), seenPriceAmount: 100_000 },
    ]);
  });

  test("stores no price on a new line when none is given", async () => {
    const { storage, result } = await setup();

    act(() => {
      result.current.add(9);
    });

    // No `seenPriceAmount` key at all, not one set to nothing.
    expect(storage.getItem(KEY)).toBe('[{"productId":9,"quantity":1}]');
  });

  test("an article at 9 still takes one more, to 10", async () => {
    const { result } = await setup({
      stored: JSON.stringify([makeItem(4, 9)]),
    });

    let outcome: AddResult | null = null;
    act(() => {
      outcome = result.current.add(4, 5);
    });

    expect(outcome).toEqual({ added: 1, outcome: "added" });
    expect(result.current.items).toEqual([makeItem(4, 10)]);
  });

  test("an article at its maximum in a full cart is at its maximum, not a full cart", async () => {
    const { result } = await setup({
      stored: JSON.stringify([...makeCart(19), makeItem(99, 10)]),
    });

    let outcome: AddResult | null = null;
    act(() => {
      outcome = result.current.add(99);
    });

    expect(outcome).toEqual({ added: 0, outcome: "at_max" });
  });

  test("caps a new line at 10 units", async () => {
    const { result } = await setup();

    act(() => {
      result.current.add(4, 15);
    });

    expect(result.current.items).toEqual([makeItem(4, 10)]);
  });

  test("refuses a 21st article as a full cart, storing nothing new", async () => {
    const { result, storedCart } = await setup({
      stored: JSON.stringify(makeCart(20)),
    });

    let outcome: AddResult | null = null;
    act(() => {
      outcome = result.current.add(99);
    });

    expect(outcome).toEqual({ added: 0, outcome: "cart_full" });
    expect(storedCart()).toEqual(makeCart(20));
  });

  test("still adds units to an article already in a full cart", async () => {
    const { result } = await setup({ stored: JSON.stringify(makeCart(20)) });

    let outcome: AddResult | null = null;
    act(() => {
      outcome = result.current.add(20, 2);
    });

    expect(outcome).toEqual({ added: 2, outcome: "added" });
    expect(result.current.items.at(-1)).toEqual(makeItem(20, 3));
  });

  test("adds the 20th article", async () => {
    const { result } = await setup({ stored: JSON.stringify(makeCart(19)) });

    let outcome: AddResult | null = null;
    act(() => {
      outcome = result.current.add(99);
    });

    expect(outcome).toEqual({ added: 1, outcome: "added" });
    expect(result.current.items).toEqual([...makeCart(19), makeItem(99, 1)]);
  });

  test.each([
    ["sets a quantity", 4, [makeItem(4, 4), makeItem(9, 1)]],
    ["caps it at 10", 12, [makeItem(4, 10), makeItem(9, 1)]],
    ["keeps exactly 1", 1, [makeItem(4, 1), makeItem(9, 1)]],
    ["takes the article out at 0", 0, [makeItem(9, 1)]],
    ["takes it out below 0", -1, [makeItem(9, 1)]],
  ])("setQuantity %s", async (_case, quantity, expected) => {
    const { result, storedCart } = await setup({
      stored: JSON.stringify([makeItem(4, 2), makeItem(9, 1)]),
    });

    act(() => {
      result.current.setQuantity(4, quantity);
    });

    expect(result.current.items).toEqual(expected);
    expect(storedCart()).toEqual(expected);
  });

  test("clear empties the cart and the stored copy", async () => {
    const { result, storedCart } = await setup({
      stored: JSON.stringify([makeItem(4, 2)]),
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.count).toBe(0);
    expect(storedCart()).toEqual([]);
  });

  test.each([
    [
      "takes out exactly the quantities ordered",
      [makeItem(4, 2), makeItem(9, 1)],
      [makeItem(4, 2), makeItem(9, 1)],
      [],
    ],
    [
      "keeps the units added to an ordered line meanwhile",
      [makeItem(4, 5), makeItem(9, 1)],
      [makeItem(4, 2), makeItem(9, 1)],
      [makeItem(4, 3)],
    ],
    [
      "keeps a line added meanwhile",
      [makeItem(4, 2), makeItem(7, 3)],
      [makeItem(4, 2)],
      [makeItem(7, 3)],
    ],
    [
      "ignores an ordered line the cart no longer has",
      [makeItem(9, 1)],
      [makeItem(4, 2), makeItem(9, 1)],
      [],
    ],
    [
      "drops a line lowered below the quantity ordered",
      [makeItem(4, 1), makeItem(9, 2)],
      [makeItem(4, 3)],
      [makeItem(9, 2)],
    ],
  ])("removeOrdered %s", async (_case, cartNow, ordered, left) => {
    const { result, storedCart } = await setup({
      stored: JSON.stringify(cartNow),
    });

    act(() => {
      result.current.removeOrdered(ordered);
    });

    expect(result.current.items).toEqual(left);
    expect(storedCart()).toEqual(left);
  });

  test("removeOrdered keeps a line's price seen", async () => {
    const { result, storedCart } = await setup({
      stored: JSON.stringify([{ ...makeItem(4, 3), seenPriceAmount: 125_000 }]),
    });

    act(() => {
      result.current.removeOrdered([makeItem(4, 1)]);
    });

    expect(storedCart()).toEqual([
      { ...makeItem(4, 2), seenPriceAmount: 125_000 },
    ]);
  });

  test("removeOrdered works on what storage holds now, as another tab left it", async () => {
    const { result, storage, storedCart } = await setup({
      stored: JSON.stringify([makeItem(4, 2)]),
    });

    // Another tab added a line; its storage event has not arrived yet.
    storage.setItem(KEY, JSON.stringify([makeItem(4, 2), makeItem(7, 1)]));
    act(() => {
      result.current.removeOrdered([makeItem(4, 2)]);
    });

    expect(storedCart()).toEqual([makeItem(7, 1)]);
    expect(result.current.items).toEqual([makeItem(7, 1)]);
  });

  test("treats stored text that is not JSON as empty, and reports it", async () => {
    const { result } = await setup({ stored: "{not json" });

    expect(result.current.items).toEqual([]);
    expect(reportError).toHaveBeenCalledWith(expect.any(SyntaxError), {
      action: "Cart.parse_storage",
    });
  });

  test.each([
    ["a price smuggled in", [{ ...makeItem(4), unitPrice: 1 }]],
    ["the same article twice", [makeItem(4), makeItem(4)]],
    ["21 articles", makeCart(21)],
    ["not a list", { productId: 4, quantity: 1 }],
    ["a negative seen price", [{ ...makeItem(4), seenPriceAmount: -1 }]],
    ["a fractional seen price", [{ ...makeItem(4), seenPriceAmount: 10.5 }]],
  ])(
    "treats a stored cart with %s as empty, without reporting it",
    async (_case, stored) => {
      const { result } = await setup({ stored: JSON.stringify(stored) });

      expect(result.current.items).toEqual([]);
      expect(reportError).not.toHaveBeenCalled();
    }
  );

  test.each(["getter", "read"] as const)(
    "a storage refused on its %s is reported once, and the cart lives in the page instead",
    async (refused) => {
      const { cart, result, storage } = await setup({ refused });

      let outcome: AddResult | null = null;
      act(() => {
        outcome = result.current.add(4);
      });
      act(() => {
        result.current.setQuantity(4, 3);
      });

      expect(outcome).toEqual({ added: 1, outcome: "added" });
      expect(result.current.items).toEqual([makeItem(4, 3)]);
      expect(result.current.count).toBe(3);
      // Another cart of the store on the page sees the same one.
      expect(renderHook(() => cart.useCart()).result.current.count).toBe(3);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(reportError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "SecurityError" }),
        { action: "Cart.open_storage" }
      );
    }
  );

  test("reports a write the storage refuses, and keeps the cart in the page", async () => {
    const { result } = await setup({ full: true });

    let outcome: AddResult | null = null;
    act(() => {
      outcome = result.current.add(4, 2);
    });

    expect(outcome).toEqual({ added: 2, outcome: "added" });
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "QuotaExceededError" }),
      { action: "Cart.write_storage" }
    );
    expect(result.current.items).toEqual([makeItem(4, 2)]);
    expect(result.current.count).toBe(2);
  });

  test("a read that throws after storage opened is reported once, and the cart carries on in the page", async () => {
    const { result, storage } = await setup({
      stored: JSON.stringify([makeItem(4, 2)]),
    });
    const refused = new DOMException(
      "The operation is insecure.",
      "SecurityError"
    );
    storage.getItem.mockImplementation(() => {
      throw refused;
    });
    storage.setItem.mockClear();

    act(() => {
      result.current.add(9);
    });
    act(() => {
      result.current.add(9);
    });

    expect(result.current.items).toEqual([makeItem(4, 2), makeItem(9, 2)]);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(refused, {
      action: "Cart.read_storage",
    });

    // Another tab's write cannot be read, so it leaves the page's copy alone.
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });
    expect(result.current.items).toEqual([makeItem(4, 2), makeItem(9, 2)]);
  });

  test("a write stored just before a read throws is the one the page carries on with", async () => {
    const { result, storage } = await setup();
    const read = storage.getItem.getMockImplementation();
    // The add's own read works; the one after its write throws.
    storage.getItem
      .mockImplementationOnce((key: string) => read?.(key) ?? null)
      .mockImplementation(() => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      });

    act(() => {
      result.current.add(4);
    });

    expect(result.current.items).toEqual([makeItem(4, 1)]);
  });

  test("a storage event for another key leaves the page's newer copy alone", async () => {
    const { result, storage } = await setup({
      stored: JSON.stringify([makeItem(4, 2)]),
    });
    storage.setItem.mockImplementationOnce(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    // Storage refuses the write: the newer cart lives in the page.
    act(() => {
      result.current.add(9);
    });
    // Another tab wrote something else to storage, not the cart.
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "feria:checkout" })
      );
    });

    expect(result.current.items).toEqual([makeItem(4, 2), makeItem(9, 1)]);
  });

  test("a cart another tab removed is not brought back when a later read throws", async () => {
    const { result, storage } = await setup({
      stored: JSON.stringify([makeItem(4, 2)]),
    });

    act(() => {
      storage.removeItem(KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });
    expect(result.current.items).toEqual([]);

    const refused = new DOMException(
      "The operation is insecure.",
      "SecurityError"
    );
    storage.getItem.mockImplementation(() => {
      throw refused;
    });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });

    expect(result.current.items).toEqual([]);
    expect(reportError).toHaveBeenCalledExactlyOnceWith(refused, {
      action: "Cart.read_storage",
    });
  });

  test("a write the storage takes again drops the page's copy, so storage is read again", async () => {
    const { result, storage, storedCart } = await setup();
    storage.setItem.mockImplementationOnce(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    act(() => {
      result.current.add(4);
    });
    expect(storedCart()).toBeNull();
    expect(result.current.items).toEqual([makeItem(4, 1)]);

    act(() => {
      result.current.add(4);
    });
    expect(storedCart()).toEqual([makeItem(4, 2)]);

    // With the page's copy gone, what another tab stores is what shows.
    act(() => {
      storage.setItem(KEY, JSON.stringify([makeItem(9, 5)]));
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });
    expect(result.current.items).toEqual([makeItem(9, 5)]);
  });

  test("another tab's write drops the page's copy, so a cart it cleared stays cleared", async () => {
    const { result, storage, storedCart } = await setup();
    storage.setItem.mockImplementationOnce(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    act(() => {
      result.current.add(4);
    });
    expect(result.current.items).toEqual([makeItem(4, 1)]);

    // Another tab empties the cart in storage.
    act(() => {
      storage.setItem(KEY, JSON.stringify([]));
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });
    expect(result.current.items).toEqual([]);

    // A later add starts from the cleared cart, not the page's old copy.
    act(() => {
      result.current.add(7);
    });
    expect(storedCart()).toEqual([makeItem(7, 1)]);
  });

  test("a storage event with no key (storage cleared) keeps the page's copy", async () => {
    const { result, storage } = await setup();
    storage.setItem.mockImplementationOnce(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    act(() => {
      result.current.add(4);
    });

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });

    expect(result.current.items).toEqual([makeItem(4, 1)]);
  });

  test.each([
    ["0 units", (cart: CartApi) => cart.add(4, 0)],
    ["-1 units", (cart: CartApi) => cart.add(4, -1)],
    ["1.5 units", (cart: CartApi) => cart.add(4, 1.5)],
    ["NaN units", (cart: CartApi) => cart.add(4, Number.NaN)],
    // Above the cap: capping first would turn these into a valid 10.
    ["10.5 units", (cart: CartApi) => cart.add(4, 10.5)],
    [
      "infinite units",
      (cart: CartApi) => cart.add(4, Number.POSITIVE_INFINITY),
    ],
    // The write itself refuses a cart that would not parse back.
    ["article 0", (cart: CartApi) => cart.add(0)],
    ["article 1.5", (cart: CartApi) => cart.add(1.5)],
  ])("refuses to add %s, changing nothing", async (_case, change) => {
    const { result, storage, storedCart } = await setup({
      stored: JSON.stringify([makeItem(4, 2)]),
    });
    storage.setItem.mockClear();

    let outcome: AddResult | null = null;
    act(() => {
      outcome = change(result.current);
    });

    expect(outcome).toEqual({ added: 0, outcome: "refused" });
    expect(result.current.items).toEqual([makeItem(4, 2)]);
    expect(storedCart()).toEqual([makeItem(4, 2)]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test.each([
    ["1.5 units", 1.5],
    ["NaN units", Number.NaN],
  ])(
    "refuses to set %s, answering false and changing nothing",
    async (_case, quantity) => {
      const { result, storage, storedCart } = await setup({
        stored: JSON.stringify([makeItem(4, 2)]),
      });
      storage.setItem.mockClear();

      let answer = true;
      act(() => {
        answer = result.current.setQuantity(4, quantity);
      });

      expect(answer).toBe(false);
      expect(result.current.items).toEqual([makeItem(4, 2)]);
      expect(storedCart()).toEqual([makeItem(4, 2)]);
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  );

  test.each([
    ["setting a quantity", 3, [makeItem(4, 3), makeItem(9, 1)]],
    ["taking an article out", 0, [makeItem(9, 1)]],
  ])("answers true after %s", async (_case, quantity, expected) => {
    const { result, storedCart } = await setup({
      stored: JSON.stringify([makeItem(4, 2), makeItem(9, 1)]),
    });

    let answer = false;
    act(() => {
      answer = result.current.setQuantity(4, quantity);
    });

    expect(answer).toBe(true);
    expect(result.current.items).toEqual(expected);
    expect(storedCart()).toEqual(expected);
  });

  test("shows a change another tab made, announced by the storage event", async () => {
    const { result, storage } = await setup();

    act(() => {
      storage.setItem(KEY, JSON.stringify([makeItem(7, 2)]));
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });

    expect(result.current.items).toEqual([makeItem(7, 2)]);
    expect(result.current.count).toBe(2);
  });

  test("keeps two readers of the cart in one tab in step", async () => {
    const { cart, result } = await setup();
    const other = renderHook(() => cart.useCart());

    act(() => {
      result.current.add(4, 3);
    });

    expect(other.result.current.items).toEqual([makeItem(4, 3)]);
    expect(other.result.current.count).toBe(3);
  });

  test("stops listening to other tabs once unmounted", async () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const { unmount } = await setup();
    const listener = added.mock.calls.find(([type]) => type === "storage")?.[1];

    expect(listener).toBeTypeOf("function");
    expect(removed.mock.calls.filter(([type]) => type === "storage")).toEqual(
      []
    );
    unmount();

    expect(removed.mock.calls.filter(([type]) => type === "storage")).toEqual([
      ["storage", listener],
    ]);
  });

  test("renders empty on the server, before the browser's cart is read", async () => {
    const { cart } = await setup({ stored: JSON.stringify([makeItem(4, 2)]) });

    function Count() {
      return <span>{cart.useCart().count}</span>;
    }

    expect(renderToString(<Count />)).toBe("<span>0</span>");
  });

  test("adds to the stored cart as it is now, before React renders again, and counts from it", async () => {
    const { result, storedCart, storage } = await setup({
      stored: JSON.stringify([makeItem(4, 2)]),
    });

    // Written past the hook, as another tab does before its event arrives.
    storage.setItem(KEY, JSON.stringify([makeItem(4, 8)]));

    let outcome: AddResult | null = null;
    act(() => {
      outcome = result.current.add(4, 5);
    });

    expect(outcome).toEqual({ added: 2, outcome: "added" });
    expect(storedCart()).toEqual([makeItem(4, 10)]);
  });
});
