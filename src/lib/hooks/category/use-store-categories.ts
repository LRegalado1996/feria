import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/** The query key of the store's category list, for the mutations below. */
export function storeCategoriesKey() {
  return orpc.category.list.queryKey();
}

/** The store's categories in their order, with their article counts. */
export function useStoreCategories() {
  return useQuery(orpc.category.list.queryOptions());
}
