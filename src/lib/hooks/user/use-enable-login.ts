import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { loginsKey } from "./use-logins";

/**
 * Enables a disabled login again (FER-015). The list is read again either way: a refusal (the last
 * enabled login, a login gone) means the list on screen is out of date.
 */
export function useEnableLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.user.enable.mutationOptions(),
    // The screen says the failure itself.
    meta: { suppressGlobalErrorReport: true },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: loginsKey() });
    },
  });
}
