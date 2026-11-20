import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { pageCurationKey } from "./use-page-curation";

/**
 * Deletes a banner (FER-020), then reads the home again, after a refusal
 * too: a banner deleted from another tab is gone from the list either way.
 */
export function useDeleteBanner() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.page.deleteBanner.mutationOptions(),
    // The dialog's screen says the failure itself.
    meta: { suppressGlobalErrorReport: true },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: pageCurationKey() });
    },
  });
}
