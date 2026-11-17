import { interpolate } from "@/lib/i18n/interpolate";

import type { CatalogQuery } from "./query";

interface Named {
  name: string;
  slug: string;
}

/**
 * The selection's name, for the heading, the title and the share card
 * (FER-023): the category, then each filter's chosen values, then the
 * search quoted by `searchTemplate` in the page's language ("«{q}»",
 * "“{q}”"), or `null` when nothing is chosen. Names a store does not have
 * (an old link) are left out.
 */
export function selectionName(
  query: CatalogQuery,
  categories: Named[],
  filters: (Named & { values: Named[] })[],
  searchTemplate: string
): string | null {
  const category = categories.find(
    (entry) => entry.slug === query.category?.slug
  );
  const values = query.filters.flatMap((entry) => {
    const filter = filters.find((known) => known.slug === entry.attribute);
    const names = entry.values.flatMap((slug) => {
      const value = filter?.values.find((known) => known.slug === slug);
      return value ? [value.name] : [];
    });

    return names.length > 0 ? [names.join(", ")] : [];
  });
  const parts = [
    ...(category ? [category.name] : []),
    ...values,
    ...(query.q ? [interpolate(searchTemplate, { q: query.q })] : []),
  ];

  return parts.length > 0 ? parts.join(" · ") : null;
}
