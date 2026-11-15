import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("@/lib/errors/client", () => ({ reportError }));

const KEY = "feria:cart:lr-market";

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
  /** The text already stored under the store's key; `null` for none. */
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
  const { result, unmount } = renderHook(() => cart.useCart("lr-market"));

  return {
    cart,
    result,
    storage,
    unmount,
    storedCart: (): unknown => JSON.parse(storage.getItem(KEY) ?? "null"),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCart", () => {
  test("keeps each store's cart under its own key", async () => {
    const { cart } = await setup();

    expect(cart.cartStorageKey("lr-market")).toBe("feria:cart:lr-market");
    expect(cart.cartStorageKey("tienda-demo")).toBe("feria:cart:tienda-demo");
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

    let added = false;
    act(() => {
      added = result.current.add(9);
    });

    expect(added).toBe(true);
    expect(result.current.items).toEqual([makeItem(4, 2), makeItem(9, 1)]);
    expect(storedCart()).toEqual([makeItem(4, 2), makeItem(9, 1)]);
  });

  test.each([
    ["adds to an existing line", 3, 2, 5],
    ["caps an existing line at 10", 8, 5, 10],
    ["reaches exactly 10", 7, 3, 10],
  ])("%s", async (_case, start, added, expected) => {
    const { result } = await setup({
      stored: JSON.stringify([makeItem(4, start)]),
    });

    act(() => {
      result.current.add(4, added);
    });

    expect(result.current.items).toEqual([makeItem(4, expected)]);
  });

  test("caps a new line at 10 units", async () => {
    const { result } = await setup();

    act(() => {
      result.current.add(4, 15);
    });

    expect(result.current.items).toEqual([makeItem(4, 10)]);
  });

  test("refuses a 21st article, answering false and storing nothing new", async () => {
    const { result, storedCart } = await setup({
      stored: JSON.stringify(makeCart(20)),
    });

    let added = true;
    act(() => {
      added = result.current.add(99);
    });

    expect(added).toBe(false);
    expect(storedCart()).toEqual(makeCart(20));
  });

  test("still adds units to an article already in a full cart", async () => {
    const { result } = await setup({ stored: JSON.stringify(makeCart(20)) });

    let added = false;
    act(() => {
      added = result.current.add(20, 2);
    });

    expect(added).toBe(true);
    expect(result.current.items.at(-1)).toEqual(makeItem(20, 3));
  });

  test("adds the 20th article", async () => {
    const { result } = await setup({ stored: JSON.stringify(makeCart(19)) });

    let added = false;
    act(() => {
      added = result.current.add(99);
    });

    expect(added).toBe(true);
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
  ])(
    "treats a stored cart with %s as empty, without reporting it",
    async (_case, stored) => {
      const { result } = await setup({ stored: JSON.stringify(stored) });

      expect(result.current.items).toEqual([]);
      expect(reportError).not.toHaveBeenCalled();
    }
  );

  test.each(["getter", "read"] as const)(
    "a storage refused on its %s is reported once, leaves the cart empty and writes nothing",
    async (refused) => {
      const { result, storage } = await setup({ refused });

      act(() => {
        result.current.add(4);
      });
      act(() => {
        result.current.setQuantity(4, 3);
      });

      expect(result.current.items).toEqual([]);
      expect(result.current.count).toBe(0);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(reportError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "SecurityError" }),
        { action: "Cart.open_storage" }
      );
    }
  );

  test("reports a write the storage refuses", async () => {
    const { result } = await setup({ full: true });

    act(() => {
      result.current.add(4);
    });

    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "QuotaExceededError" }),
      { action: "Cart.write_storage" }
    );
    expect(result.current.items).toEqual([]);
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

  test("keeps two carts of the same store in one tab in step", async () => {
    const { cart, result } = await setup();
    const other = renderHook(() => cart.useCart("lr-market"));

    act(() => {
      result.current.add(4, 3);
    });

    expect(other.result.current.items).toEqual([makeItem(4, 3)]);
    expect(other.result.current.count).toBe(3);
  });

  test("leaves another store's cart alone", async () => {
    const { cart, result, storage } = await setup();
    const other = renderHook(() => cart.useCart("tienda-demo"));

    act(() => {
      result.current.add(4);
    });

    expect(other.result.current.items).toEqual([]);
    expect(storage.getItem("feria:cart:tienda-demo")).toBeNull();
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
      return <span>{cart.useCart("lr-market").count}</span>;
    }

    expect(renderToString(<Count />)).toBe("<span>0</span>");
  });
});
