import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/** The query key of one of the store's articles, as the wizard reads it. */
export function productKey(id: number) {
  return orpc.product.get.queryKey({ input: { id } });
}

/**
 * One of the store's articles, draft or published, with everything the
 * wizard (FER-017) restores; nothing while there is no article yet. Never
 * read again on its own: the wizard's form is what changes, and the writes
 * below keep the read's status and change time current.
 */
export function useProduct(id: number | null) {
  return useQuery(
    orpc.product.get.queryOptions({
      enabled: id !== null,
      input: { id: id ?? 0 },
      refetchOnWindowFocus: false,
      staleTime: Number.POSITIVE_INFINITY,
    })
  );
}
