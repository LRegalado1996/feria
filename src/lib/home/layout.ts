import { type HomeSection, homeSectionKey } from "@/lib/schemas/home";

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
