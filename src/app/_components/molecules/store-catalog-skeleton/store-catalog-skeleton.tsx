import { getDictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";

export interface StoreCatalogSkeletonProps {
  /** The page's language when known; Spanish otherwise, the default. */
  locale?: Locale;
}

/**
 * The catalog's shape while its selection loads: a heading bar, the
 * toolbar and six cards, in the store's line color, busy for assistive
 * technology.
 */
function StoreCatalogSkeleton({ locale = "es" }: StoreCatalogSkeletonProps) {
  const { common } = getDictionary(locale);

  return (
    <div
      aria-busy="true"
      className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:py-12"
      data-slot="store-catalog-skeleton"
      data-testid="store-catalog-skeleton"
    >
      <span className="sr-only">{common.loading}</span>
      <div className="h-16 w-2/3 bg-store-line" />
      <div className="h-11 w-full bg-store-line" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3">
        {["a", "b", "c", "d", "e", "f"].map((key) => (
          <div className="aspect-4/5 bg-store-line" key={key} />
        ))}
      </div>
    </div>
  );
}

export { StoreCatalogSkeleton };
