import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { storeAttributesKey } from "./use-store-attributes";

/** Puts the filters in a new order, then reads the list again. */
export function useReorderAttributes(storeSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.attribute.reorder.mutationOptions(),
    // One move at a time per store: two in flight could land in the other
    // order.
    scope: { id: `attribute-reorder:${storeSlug}` },
    // The screen reports a failure itself, once.
    meta: { suppressGlobalErrorReport: true },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: storeAttributesKey(storeSlug),
      });
    },
  });
}
