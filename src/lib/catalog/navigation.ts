/** A category as the store's navigation lists it (FER-043). */
export interface NavigationCategory {
  id: number;
  /** The language its name is in, when it may differ from the page's. */
  lang: string;
  name: string;
  /** Its group's id, or `null` for a category in none. */
  parentId: number | null;
  /** Its page's address, unlocalized: `/bijouterie/anillos`. */
  path: string;
  slug: string;
}

/** A top-level entry: a category in no group, or a group with its own. */
export interface NavigationEntry extends NavigationCategory {
  children: NavigationCategory[];
}

/**
 * The store's categories as a menu (FER-043): those in no group, in the
 * store's order, each group holding its categories in that order. A
 * category whose group is not in the list (a stale read) shows at the top
 * rather than nowhere.
 */
export function catalogNavigation(
  categories: readonly NavigationCategory[]
): NavigationEntry[] {
  const ids = new Set(categories.map((entry) => entry.id));

  return categories
    .filter((entry) => entry.parentId === null || !ids.has(entry.parentId))
    .map((entry) => ({
      ...entry,
      children: categories.filter((child) => child.parentId === entry.id),
    }));
}

/**
 * The categories in the order a list of links shows them: each top-level
 * one, then the categories of a group right after it (the footer, the
 * filter panel).
 */
export function navigationOrder(
  categories: readonly NavigationCategory[]
): (NavigationCategory & { depth: 0 | 1 })[] {
  return catalogNavigation(categories).flatMap(({ children, ...entry }) => [
    { ...entry, depth: 0 as const },
    ...children.map((child) => ({ ...child, depth: 1 as const })),
  ]);
}

/**
 * What the store's header and its phone menu list (FER-051): the groups and
 * the categories in no group the admin left "Mostrar en el encabezado"
 * checked, each group with all its categories, which always show in its
 * dropdown. A hidden group takes its categories with it, so none of them
 * surfaces at the top. Every page stays reachable: only the header reads
 * this, never the footer, the filter panel or the catalog.
 */
export function headerCategories<
  Category extends NavigationCategory & { showInHeader: boolean },
>(categories: readonly Category[]): Category[] {
  const ids = new Set(categories.map((entry) => entry.id));
  // The top-level entries the admin shows, as `catalogNavigation` finds the
  // top: in no group, or in a group the list does not have.
  const shown = new Set(
    categories
      .filter(
        (entry) =>
          (entry.parentId === null || !ids.has(entry.parentId)) &&
          entry.showInHeader
      )
      .map((entry) => entry.id)
  );

  return categories.filter(
    (entry) =>
      shown.has(entry.id) ||
      (entry.parentId !== null && shown.has(entry.parentId))
  );
}
