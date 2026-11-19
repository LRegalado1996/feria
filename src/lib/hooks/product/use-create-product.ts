import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { productsKey } from "./use-products";

/**
 * Creates a draft article from the wizard's first photo (FER-017), then
 * reads the list again, where it now comes first.
 */
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.product.create.mutationOptions(),
    // The autosave reports its own failure, once.
    meta: { suppressGlobalErrorReport: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: productsKey() });
    },
  });
}
