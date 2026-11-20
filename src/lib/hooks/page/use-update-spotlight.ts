import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { pageCurationKey } from "./use-page-curation";

/**
 * Saves an edit of an article spotlight (FER-059), then reads the pages
 * again: its article, words and place show in the list and the preview.
 */
export function useUpdateSpotlight() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.page.updateSpotlight.mutationOptions(),
    // The form says the failure in place, and the screen reports it.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pageCurationKey() });
    },
  });
}
