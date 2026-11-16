import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/** The query key of the store's filter list, for the mutations beside it. */
export function storeAttributesKey() {
  return orpc.attribute.list.queryKey();
}

/** The store's filters in their order, each with its values and their counts. */
export function useStoreAttributes() {
  return useQuery(orpc.attribute.list.queryOptions());
}
