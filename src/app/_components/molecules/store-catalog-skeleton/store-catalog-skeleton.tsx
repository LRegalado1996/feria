"use client";

import { useDictionary } from "@/lib/hooks/i18n";

/** As many cards as two rows of the computer's grid. */
const CARD_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"];

/**
 * The catalog's shape while its selection loads (FER-039): the centered
 * title and its line, the bar with "Filtrar" and the sort, and the grid of
 * square tiles with a name and a price under each, in the tile's grey,
 * busy for assistive technology. A client component: the page's fallback
 * cannot wait for its language, and the provider above it already knows it.
 */
function StoreCatalogSkeleton() {
  const { common } = useDictionary();

  return (
    <div
      aria-busy="true"
      className="flex w-full flex-col pb-12 md:pb-18"
      data-slot="store-catalog-skeleton"
      data-testid="store-catalog-skeleton"
    >
      <span className="sr-only">{common.loading}</span>
      <div
        className="flex flex-col items-center gap-3 px-4 pt-9 pb-5.5 md:px-7 md:pt-13 md:pb-7.5"
        data-slot="store-catalog-skeleton-head"
      >
        <div className="h-8 w-48 bg-store-surface md:h-11 md:w-80" />
        <div className="h-5 w-64 max-w-full bg-store-surface" />
        <div className="h-11 w-36 rounded-full bg-store-surface" />
      </div>
      <div
        className="flex items-center justify-between gap-3 px-4 pb-3.5 md:px-7 md:pb-4.5"
        data-slot="store-catalog-skeleton-bar"
      >
        <div className="h-11 w-32 rounded-full bg-store-surface" />
        <div className="h-5 w-40 bg-store-surface" />
      </div>
      <div
        className="grid grid-cols-2 gap-x-2.5 gap-y-6 px-4 md:grid-cols-4 md:gap-x-3.5 md:gap-y-9 md:px-7"
        data-slot="store-catalog-skeleton-grid"
      >
        {CARD_KEYS.map((key) => (
          <div className="flex flex-col gap-2" key={key}>
            <div className="aspect-square bg-store-surface" />
            <div className="mt-1 h-3 w-3/4 bg-store-surface" />
            <div className="h-3 w-1/3 bg-store-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}

export { StoreCatalogSkeleton };
