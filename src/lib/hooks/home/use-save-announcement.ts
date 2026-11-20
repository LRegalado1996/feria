import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { homeCurationKey } from "./use-home-curation";

/** Saves the announcement bar (FER-020), then reads the home again. */
export function useSaveAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.home.saveAnnouncement.mutationOptions(),
    // The screen says the failure in a toast, and reports it.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: homeCurationKey() });
    },
  });
}
