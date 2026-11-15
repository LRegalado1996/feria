import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/**
 * The prefix of every order of the store read one at a time: a status
 * change refreshes the one on screen, whichever it is.
 */
export function storeOrderKeys(storeSlug: string) {
  return orpc.order.get.key({ input: { storeSlug } });
}

/** The query key of one of a store's orders. */
export function orderKey(storeSlug: string, id: number) {
  return orpc.order.get.queryKey({ input: { id, storeSlug } });
}

/** One of the store's orders, with its items and its status history. */
export function useOrder(storeSlug: string, id: number) {
  return useQuery(orpc.order.get.queryOptions({ input: { id, storeSlug } }));
}
