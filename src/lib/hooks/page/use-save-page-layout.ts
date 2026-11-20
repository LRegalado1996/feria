import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { pageCurationKey } from "./use-page-curation";

/**
 * Saves a page's order (FER-020, FER-058): its cover, its blocks, the best
 * sellers and the featured articles; then reads the pages again.
 */
export function useSavePageLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.page.saveLayout.mutationOptions(),
    // The screen says the failure in a toast, and reports it.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pageCurationKey() });
    },
  });
}
