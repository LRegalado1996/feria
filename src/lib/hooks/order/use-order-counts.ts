import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { ORDERS_REFRESH_MS } from "./use-orders";

/** The query key of the store's per-status counts. */
export function orderCountsKey() {
  return orpc.order.counts.queryKey();
}

/**
 * How many of the store's orders are in each status, read again as often as
 * the list while the tab is in sight: the navigation's count of orders to
 * pack and the screen's tabs share it.
 */
export function useOrderCounts() {
  return useQuery(
    orpc.order.counts.queryOptions({
      refetchInterval: ORDERS_REFRESH_MS,
      refetchIntervalInBackground: false,
    })
  );
}
