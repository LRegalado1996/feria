import { afterEach, describe, expect, test, vi } from "vitest";

import { checkoutRequestKey, forgetCheckoutRequest } from "./request-key";

const { reportError } = vi.hoisted(() => ({
  reportError: vi.fn<(error: unknown, context: { action: string }) => void>(),
}));

vi.mock("@/lib/errors/client", () => ({ reportError }));

const UUID_V4 =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u;

/** A store of its own, so no test reads another's request. */
function setup() {
  const storeSlug = `store-${crypto.randomUUID().slice(0, 8)}`;

  return {
    key: (signature = "cart-a") => checkoutRequestKey(storeSlug, signature),
    stored: (): unknown =>
      JSON.parse(
        window.sessionStorage.getItem(`feria:checkout:${storeSlug}`) ?? "null"
      ),
    storeSlug,
  };
}

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("checkoutRequestKey", () => {
  test("draws a v4 key for a new request and keeps it in the tab's session", () => {
    const { key, stored } = setup();

    const first = key();

    expect(first).toMatch(UUID_V4);
    expect(stored()).toEqual({ key: first, signature: "cart-a" });
  });

  test("answers the same key for the same cart and phone, even after a reload", () => {
    const { key, storeSlug } = setup();
    const first = key();

    // A reload: only the session storage remains.
    expect(checkoutRequestKey(storeSlug, "cart-a")).toBe(first);
    expect(key()).toBe(first);
  });

  test("draws a new key when the cart or the phone changed", () => {
    const { key } = setup();
    const first = key("cart-a");

    const second = key("cart-b");

    expect(second).toMatch(UUID_V4);
    expect(second).not.toBe(first);
  });

  test("keeps each store's request apart", () => {
    const one = setup();
    const other = setup();

    expect(one.key()).not.toBe(other.key());
  });

  test("forgets the request once the order is taken", () => {
    const { key, stored, storeSlug } = setup();
    const first = key();

    forgetCheckoutRequest(storeSlug);

    expect(stored()).toBeNull();
    expect(key()).not.toBe(first);
  });

  test.each([
    ["not JSON", "{", 1],
    [
      "a key that is not a v4 uuid",
      JSON.stringify({ key: "1", signature: "cart-a" }),
      0,
    ],
  ])(
    "draws a new key over a stored request that is %s",
    (_case, raw, reports) => {
      const { key, storeSlug } = setup();
      window.sessionStorage.setItem(`feria:checkout:${storeSlug}`, raw);

      expect(key()).toMatch(UUID_V4);
      expect(reportError).toHaveBeenCalledTimes(reports);
    }
  );

  test("reports a session storage that refuses reads and keeps the request in the page", () => {
    const { key } = setup();
    const failure = new Error("SecurityError");
    vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
      throw failure;
    });

    const first = key();

    expect(key()).toBe(first);
    expect(reportError).toHaveBeenCalledWith(failure, {
      action: "Checkout.read_request",
    });
  });

  test("reports a session storage that refuses writes and keeps the request in the page", () => {
    const { key, storeSlug } = setup();
    const failure = new Error("QuotaExceededError");
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw failure;
    });
    vi.spyOn(window.sessionStorage, "getItem").mockReturnValue(null);

    const first = key();

    expect(key()).toBe(first);
    expect(reportError).toHaveBeenCalledWith(failure, {
      action: "Checkout.write_request",
    });

    vi.spyOn(window.sessionStorage, "removeItem").mockImplementation(() => {
      throw failure;
    });
    forgetCheckoutRequest(storeSlug);

    expect(key()).not.toBe(first);
  });
});
