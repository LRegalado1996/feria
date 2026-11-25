import { readRowId } from "@/lib/admin/paths";
import type { RawSearchParams } from "@/lib/catalog/query";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import {
  CATALOG_FILTER_VALUES_MAX,
  CATALOG_FILTERS_MAX,
  CATALOG_SLUG_MAX_LENGTH,
  CATALOG_SLUG_PATTERN,
  DEFAULT_STORE_PRODUCT_SORT,
  type ListStoreProductsInput,
  PRODUCT_AVAILABILITIES,
  PRODUCT_STATUSES,
  type ProductAvailability,
  SEARCH_MAX_LENGTH,
  SORT_DIRECTIONS,
  type SortDirection,
  STORE_PRODUCT_SORT_DIRECTIONS,
  STORE_PRODUCT_SORTS,
  STORE_PRODUCTS_COUNT_CAP,
  type StoreProductSort,
} from "@/lib/schemas/catalog";
import { readSearchText } from "@/lib/schemas/search";

/** The article wizard's steps (FER-017), in their order. */
export const WIZARD_STEPS = ["photos", "details", "review"] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

/** The step a wizard address without one, or with an unknown one, opens on. */
export const FIRST_WIZARD_STEP: WizardStep = "photos";

/**
 * The wizard's step from its address (`?step=details`), which anyone can
 * edit: anything but a known step is the first.
 */
export function readWizardStep(value: string | null | undefined): WizardStep {
  return WIZARD_STEPS.find((step) => step === value) ?? FIRST_WIZARD_STEP;
}

/**
 * What the admin's article list shows (FER-019), all of it in the address so
 * a selection is bookmarkable, shared between tabs and walked through with
 * back and forward: the page, the search, the status, the availability, the
 * categories, the store's filters (`f.<filter>=<value>,<value>`) and the
 * sort. `dir` is always resolved: a column's own first direction when the
 * address names none.
 */
export interface ProductsQuery {
  availability: ProductAvailability | null;
  categories: string[];
  dir: SortDirection;
  /** One entry per filter, its values in the order the address gave them. */
  filters: { attribute: string; values: string[] }[];
  page: number;
  q: string | null;
  sort: StoreProductSort;
  status: (typeof PRODUCT_STATUSES)[number] | null;
}

export const EMPTY_PRODUCTS_QUERY: ProductsQuery = {
  availability: null,
  categories: [],
  dir: STORE_PRODUCT_SORT_DIRECTIONS[DEFAULT_STORE_PRODUCT_SORT],
  filters: [],
  page: 1,
  q: null,
  sort: DEFAULT_STORE_PRODUCT_SORT,
  status: null,
};

/**
 * Where a store filter's values travel in the list's address: `f.color`. A
 * filter's slug is any slug, so without the prefix one named "page" or
 * "status" would take the list's own parameter.
 */
export const FILTER_PARAM_PREFIX = "f.";

const PAGE_PATTERN = /^\d{1,5}$/u;

/** A parameter's one value; repeated (`?a=1&a=2`) or absent is none. */
function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function isSlug(value: string) {
  return (
    value.length <= CATALOG_SLUG_MAX_LENGTH && CATALOG_SLUG_PATTERN.test(value)
  );
}

/** A comma-separated list of slugs, each once, malformed ones dropped. */
function slugList(value: string | null): string[] {
  return [...new Set((value ?? "").split(",").filter(isSlug))];
}

/** `value` if it is one of `known`, else `null`. */
function oneOf<T extends string>(
  known: readonly T[],
  value: string | null
): T | null {
  return known.find((option) => option === value) ?? null;
}

/**
 * The list's selection from its address, which anyone can edit, read the
 * way the API takes it: anything malformed is dropped (a page that is no
 * number, an unknown status or sort, a value that is no slug), a search is
 * cut to what the API takes, and the categories and filters are held to its
 * limits. Slugs the store does not have are left for the API, which ignores
 * them.
 */
export function readProductsQuery(raw: RawSearchParams): ProductsQuery {
  const pageText = single(raw.page) ?? "";
  const page = PAGE_PATTERN.test(pageText) ? Number(pageText) : 1;
  const q = readSearchText(single(raw.q), SEARCH_MAX_LENGTH);
  const sort =
    oneOf(STORE_PRODUCT_SORTS, single(raw.sort)) ?? DEFAULT_STORE_PRODUCT_SORT;
  const filters = Object.entries(raw)
    .flatMap(([name, value]) => {
      const attribute = name.slice(FILTER_PARAM_PREFIX.length);

      if (!name.startsWith(FILTER_PARAM_PREFIX) || !isSlug(attribute)) {
        return [];
      }

      const values = slugList(single(value)).slice(
        0,
        CATALOG_FILTER_VALUES_MAX
      );

      return values.length > 0 ? [{ attribute, values }] : [];
    })
    .slice(0, CATALOG_FILTERS_MAX);

  return {
    availability: oneOf(PRODUCT_AVAILABILITIES, single(raw.availability)),
    categories: slugList(single(raw.category)).slice(
      0,
      CATALOG_FILTER_VALUES_MAX
    ),
    dir:
      oneOf(SORT_DIRECTIONS, single(raw.dir)) ??
      STORE_PRODUCT_SORT_DIRECTIONS[sort],
    filters,
    page: page >= 1 && page <= STORE_PRODUCTS_COUNT_CAP ? page : 1,
    q,
    sort,
    status: oneOf(PRODUCT_STATUSES, single(raw.status)),
  };
}

/**
 * The list's address for `query`, its parameters in a stable order and
 * without what is the default (page 1, the default sort, a column's own
 * first direction), so one selection is always one address. Commas stay
 * readable.
 */
export function productsPath(
  locale: Locale,
  query: ProductsQuery = EMPTY_PRODUCTS_QUERY
): string {
  const params = new URLSearchParams();

  if (query.q) {
    params.set("q", query.q);
  }

  if (query.status) {
    params.set("status", query.status);
  }

  if (query.availability) {
    params.set("availability", query.availability);
  }

  if (query.categories.length > 0) {
    params.set("category", query.categories.join(","));
  }

  for (const filter of query.filters) {
    params.set(
      `${FILTER_PARAM_PREFIX}${filter.attribute}`,
      filter.values.join(",")
    );
  }

  if (query.sort !== DEFAULT_STORE_PRODUCT_SORT) {
    params.set("sort", query.sort);
  }

  if (query.dir !== STORE_PRODUCT_SORT_DIRECTIONS[query.sort]) {
    params.set("dir", query.dir);
  }

  if (query.page > 1) {
    params.set("page", String(query.page));
  }

  const path = localizePath("/admin/products", locale);
  const search = params.toString().replaceAll("%2C", ",");

  return search ? `${path}?${search}` : path;
}

/**
 * What `product.list` is asked for `query`: the defaults left out, as the
 * address leaves them, so the page's prefetch and the screen's read are one
 * query. `limit` asks for a page of another size (the filter panel's count
 * reads one row).
 */
export function productsListInput(
  query: ProductsQuery,
  locale: Locale,
  limit?: number
): ListStoreProductsInput {
  return {
    locale,
    ...(limit === undefined ? {} : { limit }),
    ...(query.page > 1 ? { page: query.page } : {}),
    ...(query.q ? { q: query.q } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.availability ? { availability: query.availability } : {}),
    ...(query.categories.length > 0 ? { categories: query.categories } : {}),
    ...(query.filters.length > 0 ? { filters: query.filters } : {}),
    ...(query.sort === DEFAULT_STORE_PRODUCT_SORT ? {} : { sort: query.sort }),
    ...(query.dir === STORE_PRODUCT_SORT_DIRECTIONS[query.sort]
      ? {}
      : { dir: query.dir }),
  };
}

/**
 * `query` sorted by `sort`: the column already sorting by turns around, any
 * other starts in its own first direction. Back to the first page, whose
 * rows a new order changes.
 */
export function sortedBy(
  query: ProductsQuery,
  sort: StoreProductSort
): ProductsQuery {
  let dir: SortDirection = STORE_PRODUCT_SORT_DIRECTIONS[sort];

  if (query.sort === sort) {
    dir = query.dir === "asc" ? "desc" : "asc";
  }

  return { ...query, dir, page: 1, sort };
}

/** Whether `query` narrows the list at all (its order and page aside). */
export function isNarrowed(query: ProductsQuery): boolean {
  return (
    query.q !== null ||
    query.status !== null ||
    query.availability !== null ||
    query.categories.length > 0 ||
    query.filters.length > 0
  );
}

/**
 * `query` without its status, availability, categories and filters, from
 * the first page; the search and the order stay (the search has its own
 * clear button).
 */
export function withoutFilters(query: ProductsQuery): ProductsQuery {
  return {
    ...query,
    availability: null,
    categories: [],
    filters: [],
    page: 1,
    status: null,
  };
}

/** The wizard on a new article, nothing stored yet. */
export function newProductPath(locale: Locale): string {
  return localizePath("/admin/products/new", locale);
}

/**
 * The wizard on one of the store's articles, at `step` (the first one when
 * left out, which the address then leaves out too).
 */
export function productPath(
  id: number,
  locale: Locale,
  step: WizardStep = FIRST_WIZARD_STEP
): string {
  const path = localizePath(`/admin/products/${id}`, locale);

  return step === FIRST_WIZARD_STEP ? path : `${path}?step=${step}`;
}

/** An article's id from its wizard's address, or `null` (`readRowId`). */
export function readProductId(segment: string): number | null {
  return readRowId(segment);
}
