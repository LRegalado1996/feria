import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { productKey } from "./use-product";
import { productsKey } from "./use-products";

/**
 * Deletes an article (a draft discarded from the wizard, FER-017): its read
 * is dropped and the list read again.
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.product.delete.mutationOptions(),
    // The wizard says and reports a failure itself, once.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async ({ id }) => {
      queryClient.removeQueries({ queryKey: productKey(id) });
      await queryClient.invalidateQueries({ queryKey: productsKey() });
    },
  });
}
