import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { type CartProduct, useCartProducts } from "./use-cart-products";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

function makeProduct(id: number): CartProduct {
  return {
    categorySlug: null,
    cover: null,
    currencyCode: "UYU",
    id,
    isAvailable: true,
    lang: "es",
    priceAmount: id * 100,
    slug: `articulo-${id}`,
    title: `Artículo ${id}`,
  };
}

function setup({ ids = [4, 9] }: { ids?: number[] } = {}) {
  // Answers by the ids asked for, so a stale answer cannot pass for a fresh
  // one; `holdNext` keeps the next answer until `release`.
  const held: { gate: Promise<void> | null; release: () => void } = {
    gate: null,
    release: () => undefined,
  };
  const cartProducts = vi.fn(async (input: unknown) => {
    const { gate } = held;
    held.gate = null;
    await gate;
    const asked =
      typeof input === "object" && input !== null && "ids" in input
        ? input.ids
        : [];

    return Array.isArray(asked)
      ? asked.map((id: unknown) => makeProduct(Number(id)))
      : [];
  });
  server.use(createOrpcHandler("catalog.cartProducts", cartProducts));
  const wrapper = createQueryWrapper();
  const { rerender, result } = renderHook(
    ({ current }: { current: number[] }) =>
      useCartProducts({ ids: current, locale: "es" }),
    { initialProps: { current: ids }, wrapper }
  );

  return {
    cartProducts,
    /** The next answer waits until `release` is called. */
    holdNext: () => {
      held.gate = new Promise((resolve) => {
        held.release = resolve;
      });
    },
    release: () => {
      held.release();
    },
    /**
     * Another reader of the cart, mounted now on the same client (the side
     * panel opening after adding), asking for `ids` in `locale`.
     */
    readAnew: (ids: number[], locale: "en" | "es" = "es") =>
      renderHook(() => useCartProducts({ ids, locale }), { wrapper }).result,
    rerender: (next: number[]) => {
      rerender({ current: next });
    },
    result,
  };
}

describe("useCartProducts", () => {
  test("asks the store for the cart's articles in the page's language", async () => {
    const { cartProducts, result } = setup();

    await waitFor(() => {
      expect(result.current.data).toEqual([makeProduct(4), makeProduct(9)]);
    });
    expect(cartProducts).toHaveBeenCalledExactlyOnceWith({
      ids: [4, 9],
      locale: "es",
    });
  });

  test("asks nothing for an empty cart", () => {
    const { cartProducts, result } = setup({ ids: [] });

    // Enabled, it would be fetching by now: the query starts on mount.
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(cartProducts).not.toHaveBeenCalled();
  });

  test("keeps the rows shown while a shorter list loads", async () => {
    const { cartProducts, holdNext, release, rerender, result } = setup();

    await waitFor(() => {
      expect(result.current.data).toEqual([makeProduct(4), makeProduct(9)]);
    });
    holdNext();
    rerender([9]);

    await waitFor(() => {
      expect(cartProducts).toHaveBeenLastCalledWith({
        ids: [9],
        locale: "es",
      });
    });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toEqual([makeProduct(4), makeProduct(9)]);

    release();

    await waitFor(() => {
      expect(result.current.data).toEqual([makeProduct(9)]);
    });
    expect(result.current.isPlaceholderData).toBe(false);
  });

  test("a new reader of a grown cart shows the newest answer about another cart while its own loads", async () => {
    vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
    const { holdNext, readAnew, release, rerender, result } = setup();
    await waitFor(() => {
      expect(result.current.data).toEqual([makeProduct(4), makeProduct(9)]);
    });
    // A newer answer, about another list.
    vi.setSystemTime(new Date("2026-11-18T12:00:05Z"));
    rerender([9]);
    await waitFor(() => {
      expect(result.current.data).toEqual([makeProduct(9)]);
    });
    holdNext();

    const grown = readAnew([9, 11]);

    expect(grown.current.isPlaceholderData).toBe(true);
    expect(grown.current.data).toEqual([makeProduct(9)]);

    release();

    await waitFor(() => {
      expect(grown.current.data).toEqual([makeProduct(9), makeProduct(11)]);
    });
    expect(grown.current.isPlaceholderData).toBe(false);
  });

  test("a new reader in another language shows nothing of this one's answers while its own loads", async () => {
    const { holdNext, readAnew, result } = setup();
    await waitFor(() => {
      expect(result.current.data).toEqual([makeProduct(4), makeProduct(9)]);
    });
    holdNext();

    const english = readAnew([4, 9, 11], "en");

    expect(english.current.data).toBeUndefined();
    expect(english.current.isPlaceholderData).toBe(false);
  });
});
