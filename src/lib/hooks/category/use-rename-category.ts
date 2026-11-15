import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { storeCategoriesKey } from "./use-store-categories";

/** Renames a category, then reads the list again. */
export function useRenameCategory(storeSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.category.rename.mutationOptions(),
    // The row's form shows the failure next to its field.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: storeCategoriesKey(storeSlug),
      });
    },
  });
}
