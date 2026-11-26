import { useMutation } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

import { useCountOnce } from "./use-count-once";

/**
 * Counts one visit to the store per tab session, once its first page
 * is shown (FER-029). A failure stays out of sight, as an article's view's
 * does (`useCountView`).
 */
export function useCountVisit() {
  const { mutateAsync } = useMutation({
    ...orpc.metrics.countVisit.mutationOptions(),
    meta: { suppressGlobalErrorReport: true },
  });

  useCountOnce("lr-visited", async () => {
    await mutateAsync(undefined);
  });
}
