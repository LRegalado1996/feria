import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { reportError } from "@/lib/errors/client";
import { orpc } from "@/lib/orpc/client";

import { storeOrderKeys } from "./use-order";
import { orderCountsKey } from "./use-order-counts";
import { ordersKey } from "./use-orders";

/** Someone else moved the order first: the move no longer applies. */
export function isStatusConflict(error: unknown): boolean {
  return error instanceof ORPCError && error.code === "CONFLICT";
}

/**
 * Moves an order to another status. Either way it ends, the order, the
 * lists and the counts are read again before the call settles, so the
 * screen shows where the order really is. A move another staff member got
 * to first (CONFLICT) is an expected outcome, not a defect: it is not
 * reported. Any other failure is.
 */
export function useChangeOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.order.changeStatus.mutationOptions(),
    // Reported here, with its own action, or not at all.
    meta: { suppressGlobalErrorReport: true },
    onError: (error) => {
      if (!isStatusConflict(error)) {
        reportError(error, { action: "Orders.change_status" });
      }
    },
    // Every order read is refreshed, not this one by its id: the id the
    // call sent is typed as anything the schema coerces.
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: storeOrderKeys() }),
        queryClient.invalidateQueries({ queryKey: ordersKey() }),
        queryClient.invalidateQueries({ queryKey: orderCountsKey() }),
      ]);
    },
  });
}
