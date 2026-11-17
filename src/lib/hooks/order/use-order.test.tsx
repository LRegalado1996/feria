import { focusManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { orderKey, storeOrderKeys, useOrder } from "./use-order";
import { ORDERS_REFRESH_MS } from "./use-orders";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

afterEach(() => {
  // Back to reading the document's own visibility.
  focusManager.setFocused(undefined);
});

const ORDER = {
  code: "K7P2Q",
  createdAt: "2026-11-14T22:00:00.000Z",
  currencyCode: "UYU",
  customerName: "Ana Pérez",
  customerPhone: "+59899123456",
  history: [
    {
      changedByName: null,
      createdAt: "2026-11-14T22:00:00.000Z",
      status: "received",
    },
  ],
  id: 42,
  items: [
    { productId: 7, quantity: 2, title: "Collar", unitPriceAmount: 64_500 },
  ],
  locale: "es",
  note: null,
  phoneVerified: true,
  status: "received",
  totalAmount: 129_000,
};

function setup({
  fails = false,
  fakeTimers = false,
}: { fails?: boolean; fakeTimers?: boolean } = {}) {
  if (fakeTimers) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  }

  const get = vi.fn((_input: unknown) => ORDER);
  server.use(
    fails
      ? createOrpcErrorHandler("order.get", {
          code: "NOT_FOUND",
          message: "Order not found",
          status: 404,
        })
      : createOrpcHandler("order.get", get)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useOrder(42), { wrapper });

  return { get, queryClient: wrapper.queryClient, result };
}

describe("useOrder", () => {
  test("reads the order by its id in the store, cached under its key", async () => {
    const { get, queryClient, result } = setup();

    await waitFor(() => {
      expect(result.current.data).toEqual(ORDER);
    });
    expect(get).toHaveBeenCalledExactlyOnceWith({
      id: 42,
    });
    expect(queryClient.getQueryData(orderKey(42))).toEqual(ORDER);
  });

  test("keys each order apart, all of them under one prefix", async () => {
    const { queryClient, result } = setup();
    await waitFor(() => {
      expect(result.current.data).toEqual(ORDER);
    });

    expect(orderKey(43)).not.toEqual(orderKey(42));
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: storeOrderKeys() })
        .map((query) => query.state.data)
    ).toEqual([ORDER]);
  });

  test("reads the order again every 15 seconds while the tab is in sight, so another staff's move shows", async () => {
    const { get, queryClient, result } = setup({ fakeTimers: true });
    await waitFor(() => {
      expect(result.current.data).toEqual(ORDER);
    });
    const [observer] =
      queryClient.getQueryCache().find({ queryKey: orderKey(42) })?.observers ??
      [];
    expect(observer?.options).toMatchObject({
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDERS_REFRESH_MS - 1000);
    });
    expect(get).toHaveBeenCalledExactlyOnceWith({
      id: 42,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    await waitFor(() => {
      expect(get.mock.calls).toEqual([[{ id: 42 }], [{ id: 42 }]]);
    });
  });

  test("waits while the tab is out of sight", async () => {
    const { get, result } = setup({ fakeTimers: true });
    await waitFor(() => {
      expect(result.current.data).toEqual(ORDER);
    });
    focusManager.setFocused(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDERS_REFRESH_MS * 2);
    });

    expect(get).toHaveBeenCalledExactlyOnceWith({
      id: 42,
    });
  });

  test("answers a missing order as an error, never as data", async () => {
    const { result } = setup({ fails: true });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({
        code: "NOT_FOUND",
        message: "Order not found",
      });
    });
    expect(result.current.data).toBeUndefined();
  });
});
