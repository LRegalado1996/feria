"use client";

import { useCountView } from "@/lib/hooks/metrics";

export interface ArticleViewCountProps {
  productId: number;
}

/**
 * Counts the browser session's view of the article once its page is shown
 * (FER-029), from the browser, so the page's cached output counts too.
 * Draws nothing.
 */
function ArticleViewCount({ productId }: ArticleViewCountProps) {
  useCountView(productId);

  return null;
}

export { ArticleViewCount };
