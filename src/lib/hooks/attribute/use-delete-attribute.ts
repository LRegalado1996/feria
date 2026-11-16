import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { storeAttributesKey } from "./use-store-attributes";

/** Deletes a filter and its values, then reads the list again. */
export function useDeleteAttribute(storeSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.attribute.delete.mutationOptions(),
    // The dialog shows the failure itself.
    meta: { suppressGlobalErrorReport: true },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: storeAttributesKey(storeSlug),
      });
    },
  });
}
