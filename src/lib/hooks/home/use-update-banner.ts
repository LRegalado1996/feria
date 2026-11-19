import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { homeCurationKey } from "./use-home-curation";

/**
 * Saves an edit of a banner (FER-020), then reads the home again: its
 * place, its words and its photo show in the lists and the preview.
 */
export function useUpdateBanner() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.home.updateBanner.mutationOptions(),
    // The form says the failure in place, and the screen reports it.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: homeCurationKey() });
    },
  });
}
