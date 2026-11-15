import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/** The query key of a store's category list, for the mutations below. */
export function storeCategoriesKey(storeSlug: string) {
  return orpc.category.list.queryKey({ input: { storeSlug } });
}

/** A store's categories in their order, with their article counts. */
export function useStoreCategories(storeSlug: string) {
  return useQuery(orpc.category.list.queryOptions({ input: { storeSlug } }));
}
