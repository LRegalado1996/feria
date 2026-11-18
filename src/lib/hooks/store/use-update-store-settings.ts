import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { storeSettingsKey } from "./use-store-settings";

/**
 * Saves the store's settings (FER-014). The saved store the server answers
 * becomes the screen's copy at once, so what it shows next is what was
 * stored (a WhatsApp number as it was kept, say), with no second read.
 */
export function useUpdateStoreSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.store.update.mutationOptions(),
    // The form says the failure in place, and the screen reports it.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: (saved) => {
      queryClient.setQueryData(storeSettingsKey(), saved);
    },
  });
}
