import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import { type client, orpc } from "@/lib/orpc/client";
import type { StoreProductCursor } from "@/lib/schemas/catalog";

export type ProductsPage = Awaited<ReturnType<typeof client.product.list>>;

/**
 * The prefix of every list of the store's articles, whatever its pages: what
 * a save, a publish or a delete invalidates.
 */
export function productsKey() {
  return orpc.product.list.key();
}

/**
 * The store's articles for the admin's list (FER-017), drafts too, the most
 * recently changed first, a page at a time. A page read again keeps the
 * previous list on screen until it arrives.
 */
export function useProducts() {
  return useInfiniteQuery({
    ...orpc.product.list.infiniteOptions({
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: undefined as StoreProductCursor | undefined,
      input: (cursor) => ({ cursor }),
    }),
    placeholderData: keepPreviousData,
  });
}
