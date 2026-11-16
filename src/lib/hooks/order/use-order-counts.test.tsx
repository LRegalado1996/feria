import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { orderCountsKey, useOrderCounts } from "./use-order-counts";
import { ORDERS_REFRESH_MS } from "./use-orders";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const COUNTS = { delivered: 7, packed: 2, received: 3, undeliverable: 0 };

function setup({ fails = false }: { fails?: boolean } = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const counts = vi.fn((_input: unknown) => COUNTS);
  server.use(
    fails
      ? createOrpcErrorHandler("order.counts", {
          code: "NOT_FOUND",
          message: "Store not found",
          status: 404,
        })
      : createOrpcHandler("order.counts", counts)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useOrderCounts("lr-market"), {
    wrapper,
  });

  return { counts, queryClient: wrapper.queryClient, result };
}

describe("useOrderCounts", () => {
  test("reads the store's count per status, cached under its key", async () => {
    const { counts, queryClient, result } = setup();

    await waitFor(() => {
      expect(result.current.data).toEqual(COUNTS);
    });
    expect(counts).toHaveBeenCalledExactlyOnceWith({ storeSlug: "lr-market" });
    expect(queryClient.getQueryData(orderCountsKey("lr-market"))).toEqual(
      COUNTS
    );
  });

  test("reads again every 15 seconds while the tab is in sight, and only then", async () => {
    const { queryClient, result } = setup();
    await waitFor(() => {
      expect(result.current.data).toEqual(COUNTS);
    });

    const [observer] =
      queryClient
        .getQueryCache()
        .find({ queryKey: orderCountsKey("lr-market") })?.observers ?? [];
    expect(observer?.options).toMatchObject({
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
    });
  });

  test("reads again once the 15 seconds pass", async () => {
    const { counts, result } = setup();
    await waitFor(() => {
      expect(result.current.data).toEqual(COUNTS);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDERS_REFRESH_MS);
    });

    await waitFor(() => {
      expect(counts).toHaveBeenCalledTimes(2);
    });
    expect(counts).toHaveBeenLastCalledWith({ storeSlug: "lr-market" });
  });

  test("answers a refused read as an error, never as zeros", async () => {
    const { result } = setup({ fails: true });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({
        code: "NOT_FOUND",
        message: "Store not found",
      });
    });
    expect(result.current.data).toBeUndefined();
  });
});
