import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { pageCurationKey } from "./use-page-curation";

/**
 * Deletes an article spotlight (FER-059), then reads the pages again, after
 * a refusal too: one deleted from another tab is gone from the list either
 * way.
 */
export function useDeleteSpotlight() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.page.deleteSpotlight.mutationOptions(),
    // The dialog's screen says the failure itself.
    meta: { suppressGlobalErrorReport: true },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: pageCurationKey() });
    },
  });
}
