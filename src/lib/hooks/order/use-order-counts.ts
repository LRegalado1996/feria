import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { ORDERS_REFRESH_MS } from "./use-orders";

/** The query key of a store's per-status counts. */
export function orderCountsKey(storeSlug: string) {
  return orpc.order.counts.queryKey({ input: { storeSlug } });
}

/**
 * How many of a store's orders are in each status, read again as often as
 * the list while the tab is in sight: the navigation's count of orders to
 * pack and the screen's tabs share it.
 */
export function useOrderCounts(storeSlug: string) {
  return useQuery(
    orpc.order.counts.queryOptions({
      input: { storeSlug },
      refetchInterval: ORDERS_REFRESH_MS,
      refetchIntervalInBackground: false,
    })
  );
}
