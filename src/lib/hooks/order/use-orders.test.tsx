import { focusManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { OrdersQuery } from "@/lib/admin/orders";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { ORDERS_REFRESH_MS, ordersKey, useOrders } from "./use-orders";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

afterEach(() => {
  // Back to reading the document's own visibility.
  focusManager.setFocused(undefined);
});

function makeOrder(id: number, code: string) {
  return {
    code,
    createdAt: `2026-11-14T2${id}:00:00.000Z`,
    currencyCode: "UYU",
    customerName: `Customer ${code}`,
    id,
    phoneVerified: id % 2 === 0,
    status: "received",
    totalAmount: 129_000,
  };
}

const CURSOR = { createdAt: "2026-11-14T21:00:00.000Z", id: 1 };
const FIRST_PAGE = { items: [makeOrder(2, "K7P2Q")], nextCursor: CURSOR };
const LAST_PAGE = { items: [makeOrder(1, "AB3CD")], nextCursor: null };

/**
 * `order.list` answering the first page, then the last one for the cursor;
 * a status listed in `hangFor` never answers.
 */
function setup({
  fails = false,
  fakeTimers = false,
  hangFor,
  query = { q: "ana", status: "received" },
}: {
  fails?: boolean;
  fakeTimers?: boolean;
  hangFor?: string;
  query?: OrdersQuery;
} = {}) {
  if (fakeTimers) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  }

  const list = vi.fn(async (input: unknown) => {
    if (
      hangFor &&
      typeof input === "object" &&
      input !== null &&
      "status" in input &&
      input.status === hangFor
    ) {
      return await new Promise<never>(() => {});
    }

    const cursor =
      typeof input === "object" && input !== null && "cursor" in input;
    return cursor ? LAST_PAGE : FIRST_PAGE;
  });
  server.use(
    fails
      ? createOrpcErrorHandler("order.list", {
          code: "FORBIDDEN",
          message: "Forbidden",
          status: 403,
        })
      : createOrpcHandler("order.list", list)
  );
  const wrapper = createQueryWrapper();
  const view = renderHook(
    ({ current }: { current: OrdersQuery }) => useOrders("lr-market", current),
    { initialProps: { current: query }, wrapper }
  );

  return {
    list,
    queryClient: wrapper.queryClient,
    rerender: (current: OrdersQuery) => {
      view.rerender({ current });
    },
    result: view.result,
  };
}

describe("useOrders", () => {
  test("reads the first page of the store's orders for the status and search", async () => {
    const { list, result } = setup();

    await waitFor(() => {
      expect(result.current.data?.pages).toEqual([FIRST_PAGE]);
    });
    expect(list).toHaveBeenCalledExactlyOnceWith({
      q: "ana",
      status: "received",
      storeSlug: "lr-market",
    });
    expect(result.current.hasNextPage).toBe(true);
  });

  test("asks for the next page from the last one's cursor, and stops at the end", async () => {
    const { list, result } = setup({ query: {} });
    await waitFor(() => {
      expect(result.current.hasNextPage).toBe(true);
    });

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(list).toHaveBeenLastCalledWith({
      cursor: CURSOR,
      storeSlug: "lr-market",
    });
    await waitFor(() => {
      expect(result.current.data?.pages).toEqual([FIRST_PAGE, LAST_PAGE]);
    });
    expect(result.current.hasNextPage).toBe(false);
  });

  test("reads again every 15 seconds while the tab is in sight, and only then", async () => {
    const { queryClient, result } = setup();
    await waitFor(() => {
      expect(result.current.data?.pages).toEqual([FIRST_PAGE]);
    });

    const [observer] =
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ordersKey("lr-market") })[0]?.observers ?? [];
    expect(observer?.options).toMatchObject({
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
    });
  });

  test("reads again once the 15 seconds pass", async () => {
    const { list, result } = setup({ fakeTimers: true });
    await waitFor(() => {
      expect(result.current.data?.pages).toEqual([FIRST_PAGE]);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDERS_REFRESH_MS);
    });

    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2);
    });
    expect(list).toHaveBeenLastCalledWith({
      q: "ana",
      status: "received",
      storeSlug: "lr-market",
    });
  });

  test("waits while the tab is out of sight", async () => {
    const { list, result } = setup({ fakeTimers: true });
    await waitFor(() => {
      expect(result.current.data?.pages).toEqual([FIRST_PAGE]);
    });
    focusManager.setFocused(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDERS_REFRESH_MS * 2);
    });

    expect(list).toHaveBeenCalledExactlyOnceWith({
      q: "ana",
      status: "received",
      storeSlug: "lr-market",
    });
  });

  test("keeps the previous list on screen while another status loads", async () => {
    const { list, rerender, result } = setup({
      hangFor: "packed",
      query: { status: "received" },
    });
    await waitFor(() => {
      expect(result.current.data?.pages).toEqual([FIRST_PAGE]);
    });

    rerender({ status: "packed" });

    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith({
        status: "packed",
        storeSlug: "lr-market",
      });
    });
    expect(result.current.data?.pages).toEqual([FIRST_PAGE]);
    expect(result.current.isPlaceholderData).toBe(true);
  });

  test("answers a refused read as an error, never as an empty list", async () => {
    const { result } = setup({ fails: true });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({
        code: "FORBIDDEN",
        message: "Forbidden",
      });
    });
    expect(result.current.data).toBeUndefined();
  });

  test("keys every list of a store under one prefix, apart from another store's", async () => {
    const { queryClient, result } = setup();
    await waitFor(() => {
      expect(result.current.data?.pages).toEqual([FIRST_PAGE]);
    });

    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ordersKey("lr-market") })
        .map((query) => query.state.data)
    ).toEqual([{ pageParams: [undefined], pages: [FIRST_PAGE] }]);
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ordersKey("tienda-demo") })
    ).toEqual([]);
  });
});
