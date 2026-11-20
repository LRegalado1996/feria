import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { pageCurationKey } from "./use-page-curation";
import { pagesKey } from "./use-pages";

/**
 * Deletes a page (FER-060), then reads the list again, after a refusal
 * too: one deleted from another tab is gone from it either way.
 */
export function useDeletePage() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.page.delete.mutationOptions(),
    // The screen says the failure itself, and reports it.
    meta: { suppressGlobalErrorReport: true },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pagesKey() }),
        queryClient.invalidateQueries({ queryKey: pageCurationKey() }),
      ]);
    },
  });
}
