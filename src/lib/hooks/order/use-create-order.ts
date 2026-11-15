import { useMutation } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/**
 * Places an order (FER-026). The checkout says what went wrong in its own
 * words, so the global error report stays out of it; a failure it cannot
 * name is reported by the checkout itself.
 */
export function useCreateOrder() {
  return useMutation({
    ...orpc.order.create.mutationOptions(),
    meta: { suppressGlobalErrorReport: true },
  });
}
