/**
 * The page of all the store's articles (FER-043). Spanish in both
 * languages, like every catalog address: the URL's prefix is the only
 * difference between a page's two languages (docs/agents/i18n.md).
 */
export const ALL_ARTICLES_PATH = "/productos";

/** A category as its page's address needs it: its slug and its group's. */
export interface CategoryPlace {
  /** The group's slug, or `null` for a category outside any group. */
  parentSlug: string | null;
  slug: string;
}

/**
 * A category's page, under its group's when it has one:
 * `/bijouterie/anillos`, `/burbujeros`, and a group's own `/bijouterie`.
 */
export function categoryPath({ parentSlug, slug }: CategoryPlace): string {
  return parentSlug === null ? `/${slug}` : `/${parentSlug}/${slug}`;
}
