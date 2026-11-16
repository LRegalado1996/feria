import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { storeCategoriesKey } from "./use-store-categories";

/**
 * Adds a category; the list is read again once the server answered, since
 * the slug and the place are the server's to decide.
 */
export function useCreateCategory(storeSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.category.create.mutationOptions(),
    // The form shows the failure next to its field.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: storeCategoriesKey(storeSlug),
      });
    },
  });
}
