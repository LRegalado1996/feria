import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { type client, orpc } from "@/lib/orpc/client";
import type { ListStoreProductsInput } from "@/lib/schemas/catalog";

export type ProductsPage = Awaited<ReturnType<typeof client.product.list>>;

/**
 * The prefix of every read of the store's articles, whatever its page,
 * search or filters: what a save, a publish or a delete invalidates.
 */
export function productsKey() {
  return orpc.product.list.key();
}

/**
 * One numbered page of the store's articles for the admin's list (FER-019),
 * drafts too, as `input` asks (`productsListInput`): the page the address
 * names, searched, filtered and sorted. Another page, search or filter keeps
 * the previous one on screen until it arrives (design.md § Data).
 */
export function useProducts(input: ListStoreProductsInput) {
  return useQuery({
    ...orpc.product.list.queryOptions({ input }),
    placeholderData: keepPreviousData,
  });
}
