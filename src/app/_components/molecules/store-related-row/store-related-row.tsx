"use client";

import type { ReactNode } from "react";

import { StoreArticleRow } from "@/app/_components/molecules/store-article-row";
import { pickRelated, seededRandom } from "@/lib/catalog/related";
import { useVisitSeed } from "@/lib/hooks/ui";

/** A suggestion's card, rendered by the server, under a stable id. */
export interface StoreRelatedItem {
  content: ReactNode;
  id: string;
}

export interface StoreRelatedRowProps {
  className?: string;
  /** From the rest of the store, used only when `same` is short. */
  others: readonly StoreRelatedItem[];
  /** From the article's category, newest first. */
  same: readonly StoreRelatedItem[];
  title: string;
  viewAllHref?: string;
}

/**
 * "También te puede gustar" (FER-039): a row of articles picked at random
 * from the pool the server handed over (`src/lib/catalog/related.ts`). The
 * server's render, and the browser's while it hydrates, show the pool's
 * first pick in its order; once React owns the row it draws again with the
 * visit's seed. Both picks hold as many cards, whose names keep two lines,
 * so the row does not move when the cards change.
 */
function StoreRelatedRow({
  className,
  others,
  same,
  title,
  viewAllHref,
}: StoreRelatedRowProps) {
  const seed = useVisitSeed();
  const items = pickRelated(
    { others, same },
    seed === null ? null : seededRandom(seed)
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <StoreArticleRow
      className={className}
      items={items}
      title={title}
      viewAllHref={viewAllHref}
    />
  );
}

export { StoreRelatedRow };
