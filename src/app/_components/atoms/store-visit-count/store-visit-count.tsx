"use client";

import { useCountVisit } from "@/lib/hooks/metrics";

/**
 * Counts the browser session's visit to the store once its first page is
 * shown (FER-029). Draws nothing: it sits in the store's layout so every
 * store page, cached or not, counts the same way.
 */
function StoreVisitCount() {
  useCountVisit();

  return null;
}

export { StoreVisitCount };
