import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { ORDERS_REFRESH_MS } from "./use-orders";

/**
 * The prefix of every order of the store read one at a time: a status
 * change refreshes the one on screen, whichever it is.
 */
export function storeOrderKeys() {
  return orpc.order.get.key();
}

/** The query key of one of the store's orders. */
export function orderKey(id: number) {
  return orpc.order.get.queryKey({ input: { id } });
}

/**
 * One of the store's orders, with its items and its status history, read
 * again as often as the list while the tab is in sight: two staff on one
 * order see each other's moves.
 */
export function useOrder(id: number) {
  return useQuery(
    orpc.order.get.queryOptions({
      input: { id },
      refetchInterval: ORDERS_REFRESH_MS,
      refetchIntervalInBackground: false,
    })
  );
}
