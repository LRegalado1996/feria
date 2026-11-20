import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { homeCurationKey } from "./use-home-curation";

/**
 * Saves the home's order (FER-020): the cover, the rows, the best sellers
 * and the featured articles; then reads the home again.
 */
export function useSaveHomeLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.home.saveLayout.mutationOptions(),
    // The screen says the failure in a toast, and reports it.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: homeCurationKey() });
    },
  });
}
