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
