import {
  type PageLayoutFormFields,
  type PageSection,
  pageSectionKey,
} from "@/lib/schemas/page";

/** What a page's sequence can hold: the store's categories, its banners. */
export interface PageLayoutTargets {
  /** The store's categories, in their own order. */
  categoryIds: readonly number[];
  /** The banners between the page's rows. */
  rowBannerIds: readonly number[];
  /** The article spotlights between the page's rows (FER-059). */
  spotlightIds: readonly number[];
  /**
   * The home's rule (FER-020): every category has a row on it and both
   * curated rows a place, those with none yet added. Off for any other
   * page (FER-060), which shows the blocks it was given and no more.
   * Left out, on.
   */
  fillIn?: boolean;
}

/**
 * A page's sequence under its cover (FER-020, FER-058), whole: the places
 * that were saved, in their order, less any whose category, banner or
 * spotlight is gone, then a banner or a spotlight of the page with no place
 * yet (one added in another tab). On the home (`fillIn`), a page never
 * saved opens on "best sellers", then "featured", then its categories, and
 * a category added since the last save comes after the rest, in the
 * categories' own order; another page holds only what it was given. The admin's screen, its preview and the storefront
 * all read the sequence through here, so the three agree.
 */
export function resolvePageSections(
  saved: readonly PageSection[],
  { categoryIds, fillIn = true, rowBannerIds, spotlightIds }: PageLayoutTargets
): PageSection[] {
  const categories = new Set(categoryIds);
  const banners = new Set(rowBannerIds);
  const spotlights = new Set(spotlightIds);
  const placed = new Set<string>();
  const sections: PageSection[] = [];
  const place = (section: PageSection) => {
    const key = pageSectionKey(section);

    if (!placed.has(key)) {
      placed.add(key);
      sections.push(section);
    }
  };

  for (const section of saved) {
    const exists =
      (section.kind === "category" && categories.has(section.categoryId)) ||
      (section.kind === "banner" && banners.has(section.bannerId)) ||
      (section.kind === "spotlight" && spotlights.has(section.spotlightId)) ||
      section.kind === "best_sellers" ||
      section.kind === "featured";

    if (exists) {
      place(section);
    }
  }

  if (fillIn) {
    const curated: PageSection[] = [];

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
  }

  for (const bannerId of rowBannerIds) {
    place({ bannerId, kind: "banner" });
  }

  for (const spotlightId of spotlightIds) {
    place({ kind: "spotlight", spotlightId });
  }

  return sections;
}

/**
 * `sections` with `section` placed at `index` (clamped to the ends), taken
 * out of wherever it was first: a banner moved between rows.
 */
export function placePageSection(
  sections: readonly PageSection[],
  section: PageSection,
  index: number
): PageSection[] {
  const key = pageSectionKey(section);
  const rest = sections.filter((entry) => pageSectionKey(entry) !== key);
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
  PageLayoutFormFields,
  "cover" | "featured" | "ranking" | "sections"
>;

/**
 * A page's order form's lists once the server's page changed under it (a
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
      pageSectionKey(row.section)
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
/**
 * Where an article spotlight new on a page goes when no place is given:
 * first, right under the cover, where scrolling meets it (FER-059).
 */
export const DEFAULT_SPOTLIGHT_INDEX = 0;
