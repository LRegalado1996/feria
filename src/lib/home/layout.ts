import {
  type HomeLayoutFormFields,
  type HomeSection,
  homeSectionKey,
} from "@/lib/schemas/home";

/** What the home's sequence can hold: the store's categories and banners. */
export interface HomeLayoutTargets {
  /** The store's categories, in their own order. */
  categoryIds: readonly number[];
  /** The store's banners placed between rows, in the order they were made. */
  rowBannerIds: readonly number[];
}

/**
 * The home's sequence under the cover (FER-020), whole: the places that
 * were saved, in their order, less any whose category or banner is gone,
 * then what has no place yet. A store that never saved its home opens on
 * "best sellers", then "featured", then its categories; a category or a
 * banner added since the last save comes after the rest, in the
 * categories' own order. The admin's screen, its preview and the storefront
 * all read the sequence through here, so the three agree.
 */
export function resolveHomeSections(
  saved: readonly HomeSection[],
  { categoryIds, rowBannerIds }: HomeLayoutTargets
): HomeSection[] {
  const categories = new Set(categoryIds);
  const banners = new Set(rowBannerIds);
  const placed = new Set<string>();
  const sections: HomeSection[] = [];
  const place = (section: HomeSection) => {
    const key = homeSectionKey(section);

    if (!placed.has(key)) {
      placed.add(key);
      sections.push(section);
    }
  };

  for (const section of saved) {
    const exists =
      (section.kind === "category" && categories.has(section.categoryId)) ||
      (section.kind === "banner" && banners.has(section.bannerId)) ||
      section.kind === "best_sellers" ||
      section.kind === "featured";

    if (exists) {
      place(section);
    }
  }

  const curated: HomeSection[] = [];

  for (const kind of ["best_sellers", "featured"] as const) {
    if (!placed.has(kind)) {
      placed.add(kind);
      curated.push({ kind });
    }
  }

  sections.unshift(...curated);

  for (const categoryId of categoryIds) {
    place({ categoryId, kind: "category" });
  }

  for (const bannerId of rowBannerIds) {
    place({ bannerId, kind: "banner" });
  }

  return sections;
}

/**
 * `sections` with `section` placed at `index` (clamped to the ends), taken
 * out of wherever it was first: a banner moved between rows.
 */
export function placeHomeSection(
  sections: readonly HomeSection[],
  section: HomeSection,
  index: number
): HomeSection[] {
  const key = homeSectionKey(section);
  const rest = sections.filter((entry) => homeSectionKey(entry) !== key);
  const at = Math.min(Math.max(0, index), rest.length);

  return [...rest.slice(0, at), section, ...rest.slice(at)];
}

/** Where a banner new between rows goes when no place is given: after the first row. */
export const DEFAULT_ROWS_INDEX = 1;

/** One ordered list as the server held it, as it is drafted, and as the server holds it now. */
export interface OrderVersions<T> {
  draft: readonly T[];
  next: readonly T[];
  previous: readonly T[];
}

function sameOrder<T>(
  one: readonly T[],
  other: readonly T[],
  keyOf: (item: T) => string
): boolean {
  return (
    one.length === other.length &&
    one.every((item, index) => {
      const twin = other[index];
      return twin !== undefined && keyOf(item) === keyOf(twin);
    })
  );
}

/**
 * An ordered list that follows the server without losing an order drafted
 * and not saved yet. Untouched, it is the server's. Drafted, it keeps the
 * draft's order for what the server still holds (each entry as the server
 * holds it now), drops what the server no longer holds, and places what is
 * new on the server at the server's index. Merging per position instead
 * would keep a deleted banner or list one twice, which the save refuses.
 */
export function followServerOrder<T>(
  { draft, next, previous }: OrderVersions<T>,
  keyOf: (item: T) => string
): T[] {
  if (sameOrder(draft, previous, keyOf)) {
    return [...next];
  }

  const current = new Map(next.map((item) => [keyOf(item), item]));
  const drafted = new Set(draft.map(keyOf));
  const merged = draft.flatMap((item): T[] => {
    const fresh = current.get(keyOf(item));
    return fresh === undefined ? [] : [fresh];
  });

  for (const [index, item] of next.entries()) {
    if (!drafted.has(keyOf(item))) {
      merged.splice(Math.min(index, merged.length), 0, item);
    }
  }

  return merged;
}

/**
 * A curated row that follows the server: the server's when untouched, else
 * the draft less the articles that no longer exist. An article taken out in
 * the draft stays out, though the server still ranks it.
 */
function followCuratedRow(
  { draft, next, previous }: OrderVersions<{ productId: number }>,
  articleIds: ReadonlySet<number>
): { productId: number }[] {
  const keyOf = (row: { productId: number }) => String(row.productId);

  return sameOrder(draft, previous, keyOf)
    ? [...next]
    : draft.filter((row) => articleIds.has(row.productId));
}

type LayoutLists = Pick<
  HomeLayoutFormFields,
  "cover" | "featured" | "ranking" | "sections"
>;

/**
 * The home order form's lists once the server's home changed under it (a
 * banner added, moved or deleted from the side sheet): see
 * `followServerOrder` for the cover and the rows, `followCuratedRow` for
 * the best sellers and the featured articles.
 */
export function followServerLayout(
  {
    draft,
    next,
    previous,
  }: {
    draft: LayoutLists;
    next: LayoutLists;
    previous: LayoutLists;
  },
  articleIds: ReadonlySet<number>
): LayoutLists {
  const versions = <K extends keyof LayoutLists>(name: K) => ({
    draft: draft[name],
    next: next[name],
    previous: previous[name],
  });

  return {
    cover: followServerOrder(versions("cover"), (row) => String(row.bannerId)),
    featured: followCuratedRow(versions("featured"), articleIds),
    ranking: followCuratedRow(versions("ranking"), articleIds),
    sections: followServerOrder(versions("sections"), (row) =>
      homeSectionKey(row.section)
    ),
  };
}

/** Whether two of the order form's lists name the same entries in the same order. */
export function sameLayoutList(
  one: LayoutLists[keyof LayoutLists],
  other: LayoutLists[keyof LayoutLists]
): boolean {
  return JSON.stringify(one) === JSON.stringify(other);
}
