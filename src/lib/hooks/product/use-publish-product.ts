import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { productKey } from "./use-product";
import { productsKey } from "./use-products";

/**
 * Publishes an article once it has everything it needs, then reads it and the list
 * again: its status and its change time moved on the server.
 */
export function usePublishProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.product.publish.mutationOptions(),
    // The wizard says and reports a failure itself, once.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async ({ id }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productKey(id) }),
        queryClient.invalidateQueries({ queryKey: productsKey() }),
      ]);
    },
  });
}
