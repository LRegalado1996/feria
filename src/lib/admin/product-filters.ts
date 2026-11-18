import type { Dictionary } from "@/content";
import type { ProductsQuery } from "@/lib/admin/products";
import type { Locale } from "@/lib/i18n/config";
import type { client } from "@/lib/orpc/client";

/** A category of the store as the admin reads them (`category.list`). */
export type ListCategory = Awaited<
  ReturnType<typeof client.category.list>
>[number];

/** A filter of the store with its values (`attribute.list`). */
export type ListAttribute = Awaited<
  ReturnType<typeof client.attribute.list>
>[number];

/** A name in the page's language, else the Spanish one. */
export function nameIn(
  row: { nameEn: string | null; nameEs: string },
  locale: Locale
): string {
  return locale === "en" ? (row.nameEn ?? row.nameEs) : row.nameEs;
}

/** One active filter value, as a chip over the list says it. */
export interface FilterChip {
  /** What it narrows ("Estado", "Color"). */
  filter: string;
  /** Unique among the chips: what it narrows and the value. */
  id: string;
  /** A color value's swatch. */
  swatchColor: string | null;
  /** Its value ("Borrador", "Dorado"). */
  value: string;
  /** The selection without it. */
  without: ProductsQuery;
}

/**
 * The active filter values of `query` the store has, one chip each, in the
 * panel's order: the status, the availability, the categories in the
 * store's order, then each filter's values in theirs. A slug the store does
 * not have (an old bookmark) gets none, as the API ignores it, so the chips
 * and the count on "Filtros" say what really narrows the list. Each chip
 * leads to the selection without it, from the first page.
 */
export function activeFilterChips(
  query: ProductsQuery,
  {
    attributes,
    categories,
    copy,
    locale,
  }: {
    attributes: readonly ListAttribute[];
    categories: readonly ListCategory[];
    copy: Dictionary["articles"]["list"];
    locale: Locale;
  }
): FilterChip[] {
  const from = { ...query, page: 1 };
  const chips: FilterChip[] = [];

  if (query.status) {
    chips.push({
      filter: copy.filters.status,
      id: "status",
      swatchColor: null,
      value: copy.status[query.status],
      without: { ...from, status: null },
    });
  }

  if (query.availability) {
    chips.push({
      filter: copy.filters.availability,
      id: "availability",
      swatchColor: null,
      value: copy.availability[query.availability],
      without: { ...from, availability: null },
    });
  }

  for (const category of categories) {
    if (query.categories.includes(category.slug)) {
      chips.push({
        filter: copy.filters.category,
        id: `category:${category.slug}`,
        swatchColor: null,
        value: nameIn(category, locale),
        without: {
          ...from,
          categories: query.categories.filter((slug) => slug !== category.slug),
        },
      });
    }
  }

  for (const attribute of attributes) {
    const chosen =
      query.filters.find((filter) => filter.attribute === attribute.slug)
        ?.values ?? [];

    for (const value of attribute.values) {
      if (chosen.includes(value.slug)) {
        const values = chosen.filter((slug) => slug !== value.slug);
        chips.push({
          filter: nameIn(attribute, locale),
          id: `filter:${attribute.slug}:${value.slug}`,
          swatchColor: value.swatchColor,
          value: nameIn(value, locale),
          without: {
            ...from,
            filters: query.filters.flatMap((filter) => {
              if (filter.attribute !== attribute.slug) {
                return [filter];
              }

              return values.length > 0
                ? [{ attribute: attribute.slug, values }]
                : [];
            }),
          },
        });
      }
    }
  }

  return chips;
}

/**
 * The filter panel's fields (FER-019): one status and one availability
 * (`""` for all), the chosen categories' slugs, and the chosen filter values
 * as `filter:value` (a slug never holds a colon).
 */
export interface FilterFormValues {
  availability: "" | NonNullable<ProductsQuery["availability"]>;
  categories: string[];
  status: "" | NonNullable<ProductsQuery["status"]>;
  values: string[];
}

export const EMPTY_FILTER_FORM: FilterFormValues = {
  availability: "",
  categories: [],
  status: "",
  values: [],
};

/** A filter value's field token. */
export function valueToken(attribute: string, value: string): string {
  return `${attribute}:${value}`;
}

/** The panel's fields as `query` sets them. */
export function filterFormValues(query: ProductsQuery): FilterFormValues {
  return {
    availability: query.availability ?? "",
    categories: [...query.categories],
    status: query.status ?? "",
    values: query.filters.flatMap((filter) =>
      filter.values.map((value) => valueToken(filter.attribute, value))
    ),
  };
}

/**
 * `query` with the panel's fields in place of its filters, from the first
 * page; the search and the order stay. The categories and the filter
 * values come in the store's order, so one selection is always one
 * address; one the store does not have is dropped. A list not read yet, or
 * whose read failed (`undefined`), cannot tell which slugs the store has:
 * the address's own then stay as they were, less those the form let go
 * ("Limpiar"), rather than every one being dropped as unknown.
 */
export function applyFilterForm(
  query: ProductsQuery,
  values: FilterFormValues,
  {
    attributes,
    categories,
  }: {
    attributes: readonly ListAttribute[] | undefined;
    categories: readonly ListCategory[] | undefined;
  }
): ProductsQuery {
  const kept = (attribute: string, slugs: readonly string[]) =>
    slugs.filter((slug) => values.values.includes(valueToken(attribute, slug)));
  const filters = attributes
    ? attributes.map((attribute) => ({
        attribute: attribute.slug,
        values: kept(
          attribute.slug,
          attribute.values.map((value) => value.slug)
        ),
      }))
    : query.filters.map((filter) => ({
        attribute: filter.attribute,
        values: kept(filter.attribute, filter.values),
      }));

  return {
    ...query,
    availability: values.availability === "" ? null : values.availability,
    categories: (
      categories?.map((category) => category.slug) ?? query.categories
    ).filter((slug) => values.categories.includes(slug)),
    filters: filters.filter((filter) => filter.values.length > 0),
    page: 1,
    status: values.status === "" ? null : values.status,
  };
}
