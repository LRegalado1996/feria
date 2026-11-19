import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { comingSoonKey } from "./use-coming-soon";

/**
 * Publishes the coming-soon page (the store closes to the public) or takes
 * it down (FER-034). Not optimistic: the switch hides or shows the whole
 * store, so the screen says the new position only once the server stored
 * it. The texts on the screen stay as they are.
 */
export function useSetComingSoonPublished() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.comingSoon.setPublished.mutationOptions(),
    // The screen says the failure in a toast, and reports it.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async ({ published }) => {
      await queryClient.cancelQueries({ queryKey: comingSoonKey() });
      queryClient.setQueryData(comingSoonKey(), (page) =>
        page ? { ...page, published } : page
      );
    },
  });
}
