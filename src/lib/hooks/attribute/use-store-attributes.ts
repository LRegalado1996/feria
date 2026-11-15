import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/** The query key of a store's filter list, for the mutations beside it. */
export function storeAttributesKey(storeSlug: string) {
  return orpc.attribute.list.queryKey({ input: { storeSlug } });
}

/** A store's filters in their order, each with its values and their counts. */
export function useStoreAttributes(storeSlug: string) {
  return useQuery(orpc.attribute.list.queryOptions({ input: { storeSlug } }));
}
