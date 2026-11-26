import { useMutation } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { useCountOnce } from "./use-count-once";

/**
 * Counts one view of the article `productId` per browser session, once its
 * page is shown (FER-029). A failure is nobody's to see: the page never
 * shows it and the global report stays out of it, since a blocker or a lost
 * connection is not a bug; the server reports a write that fails.
 */
export function useCountView(productId: number) {
  const { mutateAsync } = useMutation({
    ...orpc.metrics.countView.mutationOptions(),
    meta: { suppressGlobalErrorReport: true },
  });

  useCountOnce(
    `lr-viewed:${String(productId)}`,
    async () => await mutateAsync({ productId })
  );
}
