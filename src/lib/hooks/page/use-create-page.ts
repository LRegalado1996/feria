import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { pageCurationKey } from "./use-page-curation";
import { pagesKey } from "./use-pages";

/**
 * Creates a page (FER-060), then reads the pages' list again: it shows
 * there.
 */
export function useCreatePage() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.page.create.mutationOptions(),
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
