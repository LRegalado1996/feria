import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { pageCurationKey } from "./use-page-curation";
import { pagesKey } from "./use-pages";

/**
 * Saves a page's settings (FER-060), then reads the list and the page's
 * editor again.
 */
export function useUpdatePage() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.page.update.mutationOptions(),
    // The screen says the failure itself, and reports it.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pagesKey() }),
        queryClient.invalidateQueries({ queryKey: pageCurationKey() }),
      ]);
    },
  });
}
