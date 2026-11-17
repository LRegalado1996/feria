import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

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
  /** Unique on the page: it prefixes the ids that name each group. */
  idPrefix: string;
  locale: Locale;
  query: CatalogQuery;
}

const GROUP_CLASS = "border-b border-store-line py-4.5 last:border-b-0";

const GROUP_HEADING_CLASS =
  "mb-1.5 font-display text-xs leading-none font-extrabold uppercase";

interface ChoiceProps {
  children: ReactNode;
  chosen: boolean;
  /** How many articles carry it; a category's "All" has none. */
  count?: number;
  href: string;
  lang?: string;
  /** The value's own color, checked as `#rrggbb` when it was saved. */
  swatchColor?: string | null;
}

/**
 * One choice: a row with a box that is ticked while the choice is in the
 * selection, the name and how many articles carry it. A link, so it works
 * before the page's script loads, and the panel it sits in stays put.
 */
function Choice({
  children,
  chosen,
  count,
  href,
  lang,
  swatchColor = null,
}: ChoiceProps) {
  return (
    <Link
      aria-current={chosen ? "true" : undefined}
      className="flex min-h-11 items-center gap-3 text-sm text-store-foreground underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
      data-chosen={chosen}
      data-slot="store-catalog-choice"
      href={href}
      lang={lang}
      scroll={false}
    >
      {/* The box shows the state the link's `aria-current` states. */}
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center border-2 border-store-foreground",
          chosen && "bg-store-foreground text-store-background"
        )}
        data-slot="store-catalog-choice-box"
      >
        {chosen ? <Check className="size-3.5" /> : null}
      </span>
      {swatchColor ? (
        <span
          aria-hidden="true"
          className="size-4.5 shrink-0 rounded-full ring-1 ring-store-foreground/25"
          data-slot="store-catalog-choice-swatch"
          style={{ backgroundColor: swatchColor }}
        />
      ) : null}
      <span className="min-w-0 flex-1 wrap-anywhere">{children}</span>
      {count === undefined ? null : (
        <span className="text-xs text-store-muted tabular-nums">{count}</span>
      )}
    </Link>
  );
}

/**
 * The catalog's choices (FER-023), as the filter panel lists them
 * (FER-039): the categories, one at a time, then each of the store's
 * filters with its values and how many articles carry each, one group
 * under the other. Every choice is a link to the address with it toggled,
 * so it works before the page's script loads, the back button undoes it,
 * and the address can be shared.
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
      className={cn("flex flex-col", className)}
      data-slot="store-catalog-filters"
    >
      {categories.length > 0 ? (
        <nav aria-labelledby={`${idPrefix}-categories`} className={GROUP_CLASS}>
          <h3 className={GROUP_HEADING_CLASS} id={`${idPrefix}-categories`}>
            {copy.categories}
          </h3>
          <ul>
            <li>
              <Choice
                chosen={query.category === null}
                href={href({ ...query, category: null })}
              >
                {copy.allCategories}
              </Choice>
            </li>
            {categories.map((category) => {
              const chosen = query.category === category.slug;

              return (
                <li key={category.slug}>
                  <Choice
                    chosen={chosen}
                    href={href({
                      ...query,
                      category: chosen ? null : category.slug,
                    })}
                    lang={category.lang}
                  >
                    {category.name}
                  </Choice>
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
          <div className={GROUP_CLASS} key={filter.slug}>
            <h3
              className={GROUP_HEADING_CLASS}
              id={`${idPrefix}-${filter.slug}`}
              lang={filter.lang}
            >
              {filter.name}
            </h3>
            <ul aria-labelledby={`${idPrefix}-${filter.slug}`}>
              {filter.values.map((value) => (
                <li key={value.slug}>
                  <Choice
                    chosen={chosen.includes(value.slug)}
                    count={value.count}
                    href={href(
                      toggleFilterValue(query, filter.slug, value.slug)
                    )}
                    lang={value.lang}
                    swatchColor={value.swatchColor}
                  >
                    {value.name}
                  </Choice>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export { StoreCatalogFilters };
