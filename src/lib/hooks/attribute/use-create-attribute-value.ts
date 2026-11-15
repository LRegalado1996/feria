import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { storeAttributesKey } from "./use-store-attributes";

/** Adds a value to a filter, then reads the list again. */
export function useCreateAttributeValue(storeSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.attribute.createValue.mutationOptions(),
    // The form shows the failure next to its field.
    meta: { suppressGlobalErrorReport: true },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: storeAttributesKey(storeSlug),
      });
    },
  });
}
