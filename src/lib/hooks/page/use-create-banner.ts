import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { pageCurationKey } from "./use-page-curation";

/**
 * Adds a banner (FER-020), then reads the home again: the banners' list,
 * the cover's order and the rows all show it.
 */
export function useCreateBanner() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.page.createBanner.mutationOptions(),
    // The form says the failure in place, and the screen reports it.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pageCurationKey() });
    },
  });
}
