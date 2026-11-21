import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/** The query key of the store's settings, for the save below. */
export function storeSettingsKey() {
  return orpc.store.get.queryKey();
}

/**
 * The store's settings (FER-014): its name, texts, contacts and currency, as
 * `store.get` reads them.
 */
export function useStoreSettings() {
  return useQuery(orpc.store.get.queryOptions());
}
