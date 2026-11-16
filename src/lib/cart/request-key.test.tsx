import { afterEach, describe, expect, test, vi } from "vitest";

const { reportError } = vi.hoisted(() => ({
  reportError: vi.fn<(error: unknown, context: { action: string }) => void>(),
}));

vi.mock("@/lib/errors/client", () => ({ reportError }));

const UUID_V4 =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u;

const STORE_SLUG = "lr-market";
const STORAGE_KEY = `feria:checkout:${STORE_SLUG}`;
const SEEDED_KEY = "55555555-5555-4555-8555-555555555555";

function makeRecord(key = SEEDED_KEY, signature = "cart-a") {
  return JSON.stringify({ key, signature });
}

type StorageMethod = "getItem" | "removeItem" | "setItem";

interface SetupOptions {
  /** The text session storage already holds for the store; `null` for none. */
  persisted?: string | null;
}

/** A session storage over a map, whose methods can refuse like a browser's. */
function makeStorage() {
  const map = new Map<string, string>();
  const refusals = new Map<StorageMethod, DOMException>();
  const guard = (method: StorageMethod) => {
    const refusal = refusals.get(method);

    if (refusal) {
      throw refusal;
    }
  };

  return {
    allow: (method: StorageMethod) => {
      refusals.delete(method);
    },
    peek: (key: string) => map.get(key) ?? null,
    refuse: (method: StorageMethod, name: string) => {
      const failure = new DOMException("Refused", name);
      refusals.set(method, failure);

      return failure;
    },
    storage: {
      clear: () => {
        map.clear();
      },
      getItem: (key: string) => {
        guard("getItem");

        return map.get(key) ?? null;
      },
      key: (index: number) => [...map.keys()][index] ?? null,
      get length() {
        return map.size;
      },
      removeItem: (key: string) => {
        guard("removeItem");
        map.delete(key);
      },
      setItem: (key: string, value: string) => {
        guard("setItem");
        map.set(key, value);
      },
    } satisfies Storage,
  };
}

/**
 * A fresh copy of the module, as a page load gets: its in-page record starts
 * empty, and only what `persisted` put in session storage is there.
 */
async function setup({ persisted = null }: SetupOptions = {}) {
  const { allow, peek, refuse, storage } = makeStorage();

  if (persisted !== null) {
    storage.setItem(STORAGE_KEY, persisted);
  }

  vi.spyOn(window, "sessionStorage", "get").mockReturnValue(storage);

  const load = async () => {
    vi.resetModules();
    return await import("./request-key");
  };
  let requestKey = await load();

  return {
    allow,
    forget: () => {
      requestKey.forgetCheckoutRequest(STORE_SLUG);
    },
    key: (signature = "cart-a") =>
      requestKey.checkoutRequestKey(STORE_SLUG, signature),
    keyFor: (storeSlug: string, signature = "cart-a") =>
      requestKey.checkoutRequestKey(storeSlug, signature),
    refuse,
    /** A page load: a new module over the same session storage. */
    reload: async () => {
      requestKey = await load();
    },
    stored: (): unknown => JSON.parse(peek(STORAGE_KEY) ?? "null"),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkoutRequestKey", () => {
  test("draws a v4 key for a new request and keeps it in the tab's session", async () => {
    const { key, stored } = await setup();

    const first = key();

    expect(first).toMatch(UUID_V4);
    expect(stored()).toEqual({ key: first, signature: "cart-a" });
  });

  test("answers the request a previous page load kept for the same cart and phone", async () => {
    const { key, stored } = await setup({ persisted: makeRecord() });

    expect(key()).toBe(SEEDED_KEY);
    expect(stored()).toEqual({ key: SEEDED_KEY, signature: "cart-a" });
    expect(reportError).not.toHaveBeenCalled();
  });

  test("answers the same key for the same cart and phone, even after a reload", async () => {
    const { key, reload } = await setup();
    const first = key();

    await reload();

    expect(key()).toBe(first);
  });

  test("draws a new key when the cart or the phone changed, and keeps that one", async () => {
    const { key, stored } = await setup({ persisted: makeRecord() });

    const second = key("cart-b");

    expect(second).toMatch(UUID_V4);
    expect(second).not.toBe(SEEDED_KEY);
    expect(stored()).toEqual({ key: second, signature: "cart-b" });
  });

  test("keeps each store's request apart", async () => {
    const { key, keyFor } = await setup({ persisted: makeRecord() });

    const other = keyFor("otra-tienda");

    expect(other).toMatch(UUID_V4);
    expect(other).not.toBe(SEEDED_KEY);
    expect(key()).toBe(SEEDED_KEY);
  });

  test("forgets the request once the order is taken", async () => {
    const { forget, key, stored } = await setup({ persisted: makeRecord() });

    forget();

    expect(stored()).toBeNull();
    expect(key()).not.toBe(SEEDED_KEY);
  });

  test("draws a new key over a stored request that is not JSON, and reports it", async () => {
    const { key } = await setup({ persisted: "{" });

    expect(key()).toMatch(UUID_V4);
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      new SyntaxError(
        "Expected property name or '}' in JSON at position 1 (line 1 column 2)"
      ),
      { action: "Checkout.parse_request" }
    );
  });

  test("draws a new key, unreported, over a stored key that is not a v4 uuid", async () => {
    const { key } = await setup({ persisted: makeRecord("1") });

    const drawn = key();

    expect(drawn).toMatch(UUID_V4);
    expect(drawn).not.toBe("1");
    expect(reportError).not.toHaveBeenCalled();
  });

  test("reports a session storage that refuses reads and keeps the request in the page", async () => {
    const { key, refuse } = await setup({ persisted: makeRecord() });
    const failure = refuse("getItem", "SecurityError");
    refuse("setItem", "SecurityError");

    const first = key();

    expect(first).not.toBe(SEEDED_KEY);
    expect(key()).toBe(first);
    expect(reportError).toHaveBeenCalledWith(failure, {
      action: "Checkout.read_request",
    });
  });

  test("reports a session storage that refuses writes and keeps the request in the page", async () => {
    const { key, refuse, stored } = await setup();
    const failure = refuse("setItem", "QuotaExceededError");

    const first = key();

    expect(key()).toBe(first);
    expect(stored()).toBeNull();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure, {
      action: "Checkout.write_request",
    });
  });

  test("a request whose write was refused outranks the older one storage still holds", async () => {
    const { key, refuse, stored } = await setup({ persisted: makeRecord() });
    refuse("setItem", "QuotaExceededError");

    const second = key("cart-b");

    expect(second).not.toBe(SEEDED_KEY);
    expect(key("cart-b")).toBe(second);
    // The cart went back to what the stale record was for: still a new
    // request, since the page's latest record is the one for cart-b.
    expect(key("cart-a")).not.toBe(SEEDED_KEY);
    expect(stored()).toEqual({ key: SEEDED_KEY, signature: "cart-a" });
  });

  test("a request forgotten while storage refused the removal stays forgotten", async () => {
    const { forget, key, refuse, stored } = await setup({
      persisted: makeRecord(),
    });
    const failure = refuse("removeItem", "SecurityError");
    refuse("setItem", "SecurityError");

    forget();

    expect(stored()).toEqual({ key: SEEDED_KEY, signature: "cart-a" });
    expect(key()).not.toBe(SEEDED_KEY);
    expect(reportError).toHaveBeenCalledWith(failure, {
      action: "Checkout.write_request",
    });
  });

  test("a write storage takes again makes storage the record once more", async () => {
    const { allow, key, refuse, stored } = await setup({
      persisted: makeRecord(),
    });
    refuse("setItem", "QuotaExceededError");
    key("cart-b");
    allow("setItem");

    const third = key("cart-c");

    expect(stored()).toEqual({ key: third, signature: "cart-c" });
    // The page's copy for cart-b is gone, so storage answers cart-c.
    expect(key("cart-c")).toBe(third);
  });

  test("a write storage takes after a refused removal drops the forgotten marker", async () => {
    const { allow, forget, key, refuse, stored } = await setup({
      persisted: makeRecord(),
    });
    refuse("removeItem", "SecurityError");
    forget();
    allow("removeItem");

    const next = key();

    expect(next).not.toBe(SEEDED_KEY);
    expect(stored()).toEqual({ key: next, signature: "cart-a" });
    expect(key()).toBe(next);
  });
});
