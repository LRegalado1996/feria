import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { loginsKey } from "./use-logins";

/**
 * Gives another login a new temporary password (FER-015). The list is read
 * again either way: saved, its row now says so; refused (a login gone, the
 * superadmin), the list on screen is out of date.
 */
export function useResetLoginPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.user.resetPassword.mutationOptions(),
    // The sheet says the failure itself.
    meta: { suppressGlobalErrorReport: true },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: loginsKey() });
    },
  });
}
