import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { type client, orpc } from "@/lib/orpc/client";

import { inOrder } from "./in-order";
import { storeAttributesKey } from "./use-store-attributes";

type StoreAttributes = Awaited<ReturnType<typeof client.attribute.list>>;

/**
 * Puts the filters in a new order at once on screen, then on the server; a
 * refused or failed save puts the previous order back.
 */
export function useReorderAttributes() {
  const queryClient = useQueryClient();
  const queryKey = storeAttributesKey();
  // The order of the last move made, which every save that went through
  // shows again.
  const latest = useRef<number[] | null>(null);

  return useMutation({
    ...orpc.attribute.reorder.mutationOptions(),
    // One move at a time, shared with the values' moves: two in flight
    // could land in the other order.
    scope: { id: "attribute-reorder" },
    // The screen reports a failure itself, once.
    meta: { suppressGlobalErrorReport: true },
    onMutate: async ({ ids }) => {
      latest.current = ids;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<StoreAttributes>(queryKey);
      queryClient.setQueryData<StoreAttributes>(queryKey, (current) =>
        current ? inOrder(current, ids) : current
      );

      return { previous };
    },
    // A save that went through shows the latest move's order again: a list
    // read meanwhile or an earlier move's rollback may have replaced it.
    // Nothing is read, so the rows do not jump under the next move.
    onSuccess: () => {
      const ids = latest.current;

      if (ids) {
        queryClient.setQueryData<StoreAttributes>(queryKey, (current) =>
          current ? inOrder(current, ids) : current
        );
      }
    },
    // A refused or failed save puts the previous order back and reads the
    // list again.
    onError: async (_error, _input, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
}
