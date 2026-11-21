import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { type client, orpc } from "@/lib/orpc/client";

import { inOrder } from "./in-order";
import { storeAttributesKey } from "./use-store-attributes";

type StoreAttributes = Awaited<ReturnType<typeof client.attribute.list>>;

/** The list with one filter's values in the order of `ids`. */
function withValuesInOrder(
  current: StoreAttributes | undefined,
  attributeId: number,
  ids: number[]
) {
  return current?.map((row) =>
    row.id === attributeId ? { ...row, values: inOrder(row.values, ids) } : row
  );
}

/**
 * Puts a filter's values in a new order at once on screen, then on the
 * server; a refused or failed save puts the previous order back.
 */
export function useReorderAttributeValues() {
  const queryClient = useQueryClient();
  const queryKey = storeAttributesKey();
  // The last move made for each filter, which every save that went through
  // shows again.
  const latest = useRef(new Map<number, number[]>());

  return useMutation({
    ...orpc.attribute.reorderValues.mutationOptions(),
    // One move at a time, shared with the filters' moves.
    scope: { id: "attribute-reorder" },
    // The screen reports a failure itself, once.
    meta: { suppressGlobalErrorReport: true },
    onMutate: async ({ attributeId, ids }) => {
      latest.current.set(attributeId, ids);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<StoreAttributes>(queryKey);
      queryClient.setQueryData<StoreAttributes>(queryKey, (current) =>
        withValuesInOrder(current, attributeId, ids)
      );

      return { previous };
    },
    // As for the filters: the latest move's order again, nothing read.
    onSuccess: (_result, { attributeId }) => {
      const ids = latest.current.get(attributeId);

      if (ids) {
        queryClient.setQueryData<StoreAttributes>(queryKey, (current) =>
          withValuesInOrder(current, attributeId, ids)
        );
      }
    },
    onError: async (_error, _input, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
}
