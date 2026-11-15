import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import {
  CATALOG_FILTER_VALUES_MAX,
  CATALOG_FILTERS_MAX,
  CATALOG_SLUG_MAX_LENGTH,
  CATALOG_SLUG_PATTERN,
  PRODUCT_SORTS,
  type ProductSort,
  RESERVED_ATTRIBUTE_SLUGS,
  SEARCH_MAX_LENGTH,
} from "@/lib/schemas/catalog";

/** What a catalog address asks for (FER-023). */
export interface CatalogQuery {
  category: string | null;
  /** One entry per filter, its values in the order the address gave them. */
  filters: { attribute: string; values: string[] }[];
  q: string | null;
  sort: ProductSort;
}

/** The query string as Next hands it to a page. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export const EMPTY_CATALOG_QUERY: CatalogQuery = {
  category: null,
  filters: [],
  q: null,
  sort: "newest",
};

function isSlug(value: string) {
  return (
    value.length <= CATALOG_SLUG_MAX_LENGTH && CATALOG_SLUG_PATTERN.test(value)
  );
}

/** A parameter's one value; repeated (`?a=1&a=2`) or absent is none. */
function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

/**
 * Reads a catalog address the way a shared link must be read: anything
 * malformed is dropped, never sent to the API, which refuses a malformed
 * filter. `category`, `q` and `sort` are the catalog's own; every other
 * parameter whose name and comma-separated values are slugs is a filter, at
 * most 10 of 20 values each. `fbclid`, `utm_source` or a stray capital fall
 * away, so a link with them still shows its selection.
 */
export function readCatalogQuery(raw: RawSearchParams): CatalogQuery {
  const category = single(raw.category);
  const q = single(raw.q)?.trim().slice(0, SEARCH_MAX_LENGTH) ?? "";
  const sort = single(raw.sort);
  const reserved = new Set<string>(RESERVED_ATTRIBUTE_SLUGS);
  const filters = Object.entries(raw)
    .filter(([name]) => !reserved.has(name) && isSlug(name))
    .flatMap(([attribute, value]) => {
      const values = [
        ...new Set((single(value) ?? "").split(",").filter(isSlug)),
      ].slice(0, CATALOG_FILTER_VALUES_MAX);

      return values.length > 0 ? [{ attribute, values }] : [];
    })
    .slice(0, CATALOG_FILTERS_MAX);

  return {
    category: category !== null && isSlug(category) ? category : null,
    filters,
    q: q === "" ? null : q,
    sort: PRODUCT_SORTS.find((known) => known === sort) ?? "newest",
  };
}

/**
 * The catalog address for `query`, in a stable order (category, filters as
 * given, search, sort), leaving out what is the default, so the same
 * selection is always the same link.
 */
export function catalogHref(
  storeSlug: string,
  locale: Locale,
  query: CatalogQuery
): string {
  const params = new URLSearchParams();

  if (query.category) {
    params.set("category", query.category);
  }

  for (const filter of query.filters) {
    params.set(filter.attribute, filter.values.join(","));
  }

  if (query.q) {
    params.set("q", query.q);
  }

  if (query.sort !== "newest") {
    params.set("sort", query.sort);
  }

  const path = localizePath(`/${storeSlug}/products`, locale);
  // Commas stay readable in a link that is pasted into a chat.
  const search = params.toString().replaceAll("%2C", ",");

  return search ? `${path}?${search}` : path;
}

/** `query` with `value` of `attribute` added, or taken out if it was in. */
export function toggleFilterValue(
  query: CatalogQuery,
  attribute: string,
  value: string
): CatalogQuery {
  const current = query.filters.find(
    (filter) => filter.attribute === attribute
  );

  if (!current) {
    return {
      ...query,
      filters: [...query.filters, { attribute, values: [value] }],
    };
  }

  const values = current.values.includes(value)
    ? current.values.filter((other) => other !== value)
    : [...current.values, value];

  return {
    ...query,
    filters: query.filters.flatMap((filter) => {
      if (filter.attribute !== attribute) {
        return [filter];
      }

      return values.length > 0 ? [{ attribute, values }] : [];
    }),
  };
}

/** Whether `query` narrows the catalog at all (sort aside). */
export function isFiltered(query: CatalogQuery): boolean {
  return (
    query.category !== null || query.q !== null || query.filters.length > 0
  );
}

/** `query` without any narrowing, keeping its sort. */
export function clearFilters(query: CatalogQuery): CatalogQuery {
  return { ...EMPTY_CATALOG_QUERY, sort: query.sort };
}

/**
 * `query` without a category or filter values the store does not have (an
 * old link, a typo): they are ignored, as the API ignores an unknown
 * filter, instead of narrowing the catalog to nothing under a heading that
 * does not name them.
 */
export function knownOnly(
  query: CatalogQuery,
  categories: { slug: string }[],
  filters: { slug: string; values: { slug: string }[] }[]
): CatalogQuery {
  return {
    ...query,
    category: categories.some((entry) => entry.slug === query.category)
      ? query.category
      : null,
    filters: query.filters.flatMap((entry) => {
      const filter = filters.find((known) => known.slug === entry.attribute);
      const values = entry.values.filter((slug) =>
        filter?.values.some((known) => known.slug === slug)
      );

      return values.length > 0 ? [{ attribute: entry.attribute, values }] : [];
    }),
  };
}
