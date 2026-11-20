import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { type client, orpc } from "@/lib/orpc/client";

import { storeCategoriesKey } from "./use-store-categories";

type StoreCategories = Awaited<ReturnType<typeof client.category.list>>;

/**
 * The list with the rows `ids` lists first, in that order, then any row it
 * does not list (one added after the move was made) in its own order;
 * positions renumbered, so an id the list does not hold leaves no gap.
 */
function inOrder(current: StoreCategories | undefined, ids: number[]) {
  if (!current) {
    return current;
  }

  const byId = new Map(current.map((row) => [row.id, row]));
  const listed = new Set(ids);

  return [
    ...ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    }),
    ...current.filter((row) => !listed.has(row.id)),
  ].map((row, position) => ({ ...row, position }));
}

/**
 * Puts the categories in a new order at once on screen, then on the server;
 * a refused or failed save puts the previous order back.
 */
export function useReorderCategories() {
  const queryClient = useQueryClient();
  const queryKey = storeCategoriesKey();
  // The order of the last move made, which every save that went through
  // shows again.
  const latest = useRef<number[] | null>(null);

  return useMutation({
    ...orpc.category.reorder.mutationOptions(),
    // One move at a time: two quick moves in flight could reach the server
    // in the other order, and a rollback would undo the second.
    scope: { id: "category-reorder" },
    // The screen reports a failure itself, once.
    meta: { suppressGlobalErrorReport: true },
    onMutate: async ({ ids }) => {
      latest.current = ids;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<StoreCategories>(queryKey);

      queryClient.setQueryData<StoreCategories>(queryKey, (current) =>
        inOrder(current, ids)
      );

      return { previous };
    },
    // A save that went through puts the latest move's order back on screen:
    // a list read meanwhile (after a rename) or an earlier move's rollback may
    // have replaced it, and a move still queued behind this one is newer than
    // it. Nothing is read, so the rows do not re-render under the next drag.
    onSuccess: () => {
      const ids = latest.current;

      if (ids) {
        queryClient.setQueryData<StoreCategories>(queryKey, (current) =>
          inOrder(current, ids)
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
