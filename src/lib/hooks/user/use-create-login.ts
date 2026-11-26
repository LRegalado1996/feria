import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { loginsKey } from "./use-logins";

/**
 * Creates a login with the temporary password the admin typed (FER-015);
 * the list is read again once the server answered.
 */
export function useCreateLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.user.create.mutationOptions(),
    // The form says the failure next to its field.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: loginsKey() });
    },
  });
}
