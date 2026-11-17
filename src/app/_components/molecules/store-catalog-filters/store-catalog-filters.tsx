import Link from "next/link";

import { StoreChip } from "@/app/_components/atoms/store-chip";
import type { Dictionary } from "@/content";
import {
  type CatalogQuery,
  catalogHref,
  toggleFilterValue,
} from "@/lib/catalog/query";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/** A category as the catalog lists it. */
export interface CatalogCategory {
  lang: string;
  name: string;
  slug: string;
}

/** A filter as the storefront offers it: only values an article carries. */
export interface CatalogFilter {
  lang: string;
  name: string;
  slug: string;
  values: {
    count: number;
    lang: string;
    name: string;
    slug: string;
    swatchColor: string | null;
  }[];
}

export interface StoreCatalogFiltersProps {
  categories: CatalogCategory[];
  className?: string;
  copy: Dictionary["storefront"]["catalog"];
  filters: CatalogFilter[];
  /** Unique on the page: the sidebar and the phone sheet each have one. */
  idPrefix: string;
  locale: Locale;
  query: CatalogQuery;
}

/**
 * The catalog's choices (FER-023): the categories, one at a time, then each
 * of the store's filters with its values and how many articles carry each.
 * Every choice is a link to the address with it toggled, so it works before
 * the page's script loads and the back button undoes it.
 */
function StoreCatalogFilters({
  categories,
  className,
  copy,
  filters,
  idPrefix,
  locale,
  query,
}: StoreCatalogFiltersProps) {
  const href = (next: CatalogQuery) => catalogHref(locale, next);

  return (
    <div
      className={cn("flex flex-col gap-8", className)}
      data-slot="store-catalog-filters"
    >
      {categories.length > 0 ? (
        <nav aria-labelledby={`${idPrefix}-categories`}>
          <h2
            className="mb-3 text-sm font-semibold text-store-foreground"
            id={`${idPrefix}-categories`}
          >
            {copy.categories}
          </h2>
          <ul className="flex flex-wrap gap-2">
            <li>
              <StoreChip asChild selected={query.category === null}>
                <Link
                  aria-current={query.category === null ? "true" : undefined}
                  href={href({ ...query, category: null })}
                >
                  {copy.allCategories}
                </Link>
              </StoreChip>
            </li>
            {categories.map((category) => {
              const selected = query.category === category.slug;

              return (
                <li key={category.slug}>
                  <StoreChip asChild selected={selected}>
                    <Link
                      aria-current={selected ? "true" : undefined}
                      href={href({
                        ...query,
                        category: selected ? null : category.slug,
                      })}
                      lang={category.lang}
                    >
                      {category.name}
                    </Link>
                  </StoreChip>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      {filters.map((filter) => {
        const chosen =
          query.filters.find((entry) => entry.attribute === filter.slug)
            ?.values ?? [];

        return (
          // Its heading names it in the outline; a landmark per filter
          // would crowd the page's.
          <div key={filter.slug}>
            <h2
              className="mb-3 text-sm font-semibold text-store-foreground"
              id={`${idPrefix}-${filter.slug}`}
              lang={filter.lang}
            >
              {filter.name}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {filter.values.map((value) => {
                const selected = chosen.includes(value.slug);

                return (
                  <li key={value.slug}>
                    <StoreChip asChild className="gap-2" selected={selected}>
                      <Link
                        aria-current={selected ? "true" : undefined}
                        href={href(
                          toggleFilterValue(query, filter.slug, value.slug)
                        )}
                        lang={value.lang}
                      >
                        {value.swatchColor ? (
                          <span
                            aria-hidden="true"
                            className="size-3 shrink-0 ring-1 ring-store-foreground"
                            // The value's own swatch, checked as `#rrggbb`
                            // when it was saved.
                            style={{ backgroundColor: value.swatchColor }}
                          />
                        ) : null}
                        {value.name}
                        <span
                          className={selected ? undefined : "text-store-muted"}
                        >
                          ({value.count})
                        </span>
                      </Link>
                    </StoreChip>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export { StoreCatalogFilters };
