import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import type { OrdersQuery } from "@/lib/admin/orders";
import { type client, orpc } from "@/lib/orpc/client";
import type { ListOrdersValues } from "@/lib/schemas/order";

export type OrdersPage = Awaited<ReturnType<typeof client.order.list>>;

/**
 * How often an open orders screen asks again. The screen is the only place
 * a new order is announced (FER-027), so it refreshes on its own.
 */
export const ORDERS_REFRESH_MS = 15_000;

/**
 * The prefix of every list of the store's orders, whatever its status,
 * search or pages: what a status change invalidates.
 */
export function ordersKey() {
  return orpc.order.list.key();
}

/**
 * The store's orders, newest first, a page at a time. Every loaded page is read
 * again every 15 seconds while the tab is in sight (a hidden tab waits), and
 * a new status or search keeps the previous list on screen until its own
 * arrives.
 */
export function useOrders({ q, status }: OrdersQuery) {
  return useInfiniteQuery({
    ...orpc.order.list.infiniteOptions({
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: undefined as ListOrdersValues["cursor"],
      input: (cursor) => ({ cursor, q, status }),
    }),
    placeholderData: keepPreviousData,
    refetchInterval: ORDERS_REFRESH_MS,
    refetchIntervalInBackground: false,
  });
}
