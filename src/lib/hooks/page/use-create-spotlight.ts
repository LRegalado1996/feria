import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { pageCurationKey } from "./use-page-curation";

/**
 * Adds an article spotlight to a page (FER-059), then reads the pages
 * again: the list, the page's order and the preview all show it.
 */
export function useCreateSpotlight() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.page.createSpotlight.mutationOptions(),
    // The form says the failure in place, and the screen reports it.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pageCurationKey() });
    },
  });
}
