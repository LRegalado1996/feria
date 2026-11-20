import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { pageCurationKey } from "./use-page-curation";
import { pagesKey } from "./use-pages";

/**
 * Chooses the page the store shows at its home (FER-060), then reads the
 * list and the editors again, after a refusal too: the home's mark and its
 * rules move with it.
 */
export function useSetHomePage() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.page.setHome.mutationOptions(),
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
