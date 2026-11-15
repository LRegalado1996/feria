import { useMutation, useQueryClient } from "@tanstack/react-query";

import { type client, orpc } from "@/lib/orpc/client";

import { storeCategoriesKey } from "./use-store-categories";

type StoreCategories = Awaited<ReturnType<typeof client.category.list>>;

/**
 * Puts the categories in a new order at once on screen, then on the server;
 * a refused or failed save puts the previous order back.
 */
export function useReorderCategories(storeSlug: string) {
  const queryClient = useQueryClient();
  const queryKey = storeCategoriesKey(storeSlug);

  return useMutation({
    ...orpc.category.reorder.mutationOptions(),
    // One move at a time per store: two quick moves in flight could reach
    // the server in the other order, and a rollback would undo the second.
    scope: { id: `category-reorder:${storeSlug}` },
    // The screen reports a failure itself, once.
    meta: { suppressGlobalErrorReport: true },
    onMutate: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<StoreCategories>(queryKey);

      queryClient.setQueryData<StoreCategories>(queryKey, (current) => {
        if (!current) {
          return current;
        }

        const byId = new Map(current.map((row) => [row.id, row]));

        // Positions follow the rows that remain, so an id the list does not
        // hold leaves no gap.
        return ids
          .flatMap((id) => {
            const row = byId.get(id);
            return row ? [row] : [];
          })
          .map((row, position) => ({ ...row, position }));
      });

      return { previous };
    },
    // A refused or failed save puts the previous order back and reads the
    // list again. A save that went through already shows what the server
    // holds, so it reads nothing: a refetch would re-render the rows under
    // the next drag.
    onError: async (_error, _input, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
}
