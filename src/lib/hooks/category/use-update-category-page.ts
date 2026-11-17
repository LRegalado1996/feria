import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { storeCategoriesKey } from "./use-store-categories";

/**
 * Sets a category's page (FER-043): its group, its texts for search
 * engines and its cover's description; then reads the list again, whose
 * rows show the groups.
 */
export function useUpdateCategoryPage() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.category.updatePage.mutationOptions(),
    // The row's form says the failure in place.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: storeCategoriesKey(),
      });
    },
  });
}
