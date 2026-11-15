import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { storeAttributesKey } from "./use-store-attributes";

/** Puts a filter's values in a new order, then reads the list again. */
export function useReorderAttributeValues(storeSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.attribute.reorderValues.mutationOptions(),
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
