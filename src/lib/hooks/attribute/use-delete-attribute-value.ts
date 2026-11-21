import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { storeAttributesKey } from "./use-store-attributes";

/** Deletes a value, taking it off its articles, then reads the list again. */
export function useDeleteAttributeValue() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.attribute.deleteValue.mutationOptions(),
    // The dialog shows the failure itself.
    meta: { suppressGlobalErrorReport: true },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: storeAttributesKey(),
      });
    },
  });
}
