import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { storeAttributesKey } from "./use-store-attributes";

/** Adds a filter, then reads the list again: the slug is the server's. */
export function useCreateAttribute(storeSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.attribute.create.mutationOptions(),
    // The form shows the failure next to its field.
    meta: { suppressGlobalErrorReport: true },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: storeAttributesKey(storeSlug),
      });
    },
  });
}
