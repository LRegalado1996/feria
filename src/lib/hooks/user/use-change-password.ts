import { useMutation } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/**
 * The signed-in login choosing its own password (FER-015). Nothing is cached
 * to update: the page reloads once it is saved.
 */
export function useChangePassword() {
  return useMutation({
    ...orpc.admin.changePassword.mutationOptions(),
    // The form says the failure next to its field.
    meta: { suppressGlobalErrorReport: true },
  });
}
