import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { comingSoonKey } from "./use-coming-soon";

/**
 * Saves the coming-soon page's texts and day (FER-034). The page the server
 * answers becomes the screen's copy at once, so what it shows next is what
 * was stored (a text trimmed, a blank one gone), with no second read.
 */
export function useUpdateComingSoon() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.comingSoon.update.mutationOptions(),
    // The screen says the failure in a toast, and reports it.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async (saved) => {
      // A read still on its way was answered before the save: landing
      // later, it would put the old texts back on the screen.
      await queryClient.cancelQueries({ queryKey: comingSoonKey() });
      queryClient.setQueryData(comingSoonKey(), saved);
    },
  });
}
