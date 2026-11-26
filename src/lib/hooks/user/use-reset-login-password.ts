import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { loginsKey } from "./use-logins";

/**
 * Gives another login a new temporary password (FER-015); the list is read
 * again once the server answered, since its row now says so.
 */
export function useResetLoginPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.user.resetPassword.mutationOptions(),
    // The sheet says the failure itself.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: loginsKey() });
    },
  });
}
