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

import { ALL_ARTICLES_PATH } from "./paths";

/** A category as a catalog address names it: its slug and its page. */
export interface CatalogPlace {
  path: string;
  slug: string;
}

/**
 * What a catalog address asks for (FER-023): the page it is on (a category
 * or a group, FER-043, else all articles), then the query string.
 */
export interface CatalogQuery {
  category: CatalogPlace | null;
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
 * filter. `q` and `sort` are the catalog's own, `category` too (the old
 * address's, now the path's: `readLegacyCategory`); every other
 * parameter whose name and comma-separated values are slugs is a filter.
 * `fbclid`, `utm_source` or a stray capital fall away, so a link with them
 * still shows its selection. Nothing is capped here: a slug-shaped tracking
 * parameter only counts once `knownOnly` has dropped it, or ten of them
 * before `color=dorado` would push the real filter out. The request's own
 * size limit bounds how much there is to read.
 */
export function readCatalogQuery(
  raw: RawSearchParams,
  category: CatalogPlace | null
): CatalogQuery {
  const q = single(raw.q)?.trim().slice(0, SEARCH_MAX_LENGTH) ?? "";
  const sort = single(raw.sort);
  const reserved = new Set<string>(RESERVED_ATTRIBUTE_SLUGS);
  const filters = Object.entries(raw)
    .filter(([name]) => !reserved.has(name) && isSlug(name))
    .flatMap(([attribute, value]) => {
      const values = [
        ...new Set((single(value) ?? "").split(",").filter(isSlug)),
      ];

      return values.length > 0 ? [{ attribute, values }] : [];
    });

  return {
    category,
    filters,
    q: q === "" ? null : q,
    sort: PRODUCT_SORTS.find((known) => known === sort) ?? "newest",
  };
}

/**
 * The catalog address for `query`: its page (FER-043), then the query string
 * in a stable order (filters as given, search, sort), leaving out what is
 * the default, so the same selection is always the same link.
 */
export function catalogHref(locale: Locale, query: CatalogQuery): string {
  const params = new URLSearchParams();

  for (const filter of query.filters) {
    params.set(filter.attribute, filter.values.join(","));
  }

  if (query.q) {
    params.set("q", query.q);
  }

  if (query.sort !== "newest") {
    params.set("sort", query.sort);
  }

  const path = localizePath(query.category?.path ?? ALL_ARTICLES_PATH, locale);
  // Commas stay readable in a link that is pasted into a chat.
  const search = params.toString().replaceAll("%2C", ",");

  return search ? `${path}?${search}` : path;
}

/**
 * A query string as Next hands it to a page, from `URLSearchParams`: a
 * name given more than once keeps every value, in order.
 */
export function rawSearchParams(params: URLSearchParams): RawSearchParams {
  const raw: RawSearchParams = {};

  for (const name of new Set(params.keys())) {
    const values = params.getAll(name);
    raw[name] = values.length === 1 ? values[0] : values;
  }

  return raw;
}

/**
 * A query string as Next hands it to a page, written back as the text after
 * `?` (empty for none), its commas readable, every value kept: what a
 * redirect carries to the page's new address.
 */
export function searchOf(raw: RawSearchParams): string {
  const params = new URLSearchParams();

  for (const [name, value] of Object.entries(raw)) {
    for (const one of [value ?? []].flat()) {
      params.append(name, one);
    }
  }

  return params.toString().replaceAll("%2C", ",");
}

/**
 * The category an address of the catalog's old page asks for
 * (`/products?category=anillos`, before FER-043), or `null`: a slug only.
 */
export function readLegacyCategory(raw: RawSearchParams): string | null {
  const category = single(raw.category);

  return category !== null && isSlug(category) ? category : null;
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
 * `query` without filter values the store does not have (an old link, a
 * typo): they are ignored, as the API ignores an unknown
 * filter, instead of narrowing the catalog to nothing under a heading that
 * does not name them. The filters and their values come in the store's own
 * order, whatever order the address gave them, so one selection is always
 * one link (and one canonical address). What is left is held to what the
 * API takes, at most 10 filters of 20 values each, counting only what the
 * store has.
 */
export function knownOnly(
  query: CatalogQuery,
  filters: { slug: string; values: { slug: string }[] }[]
): CatalogQuery {
  return {
    ...query,
    filters: filters
      .flatMap((filter) => {
        const chosen =
          query.filters.find((entry) => entry.attribute === filter.slug)
            ?.values ?? [];
        const values = filter.values
          .map((value) => value.slug)
          .filter((slug) => chosen.includes(slug))
          .slice(0, CATALOG_FILTER_VALUES_MAX);

        return values.length > 0 ? [{ attribute: filter.slug, values }] : [];
      })
      .slice(0, CATALOG_FILTERS_MAX),
  };
}
