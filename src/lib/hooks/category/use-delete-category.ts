import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { storeCategoriesKey } from "./use-store-categories";

/** Deletes a category (moving its articles), then reads the list again. */
export function useDeleteCategory(storeSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.category.delete.mutationOptions(),
    // The dialog shows the failure itself.
    meta: { suppressGlobalErrorReport: true },
    // Read the list again either way: after a refusal the category may have
    // gained articles since it was loaded, and the dialog must ask where
    // they go.
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: storeCategoriesKey(storeSlug),
      });
    },
  });
}
