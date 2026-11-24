/**
 * The page of all the store's articles (FER-043). Spanish in both
 * languages, like every catalog address: the URL's prefix is the only
 * difference between a page's two languages (docs/agents/i18n.md).
 */
export const ALL_ARTICLES_PATH = "/productos";

/**
 * The store's contact page (FER-080), on the same Spanish path in both
 * languages. A page of its own, in a folder of its own, which the router
 * prefers over a category's one-segment address; and no category, group
 * or page built from sections can be `contacto`
 * (`RESERVED_CATEGORY_SLUGS`), so none is ever shadowed by it.
 */
export const CONTACT_PATH = "/contacto";

/**
 * An article's page, under all articles' (`/productos/anillo-sello`): a
 * category can never be `productos` (`RESERVED_CATEGORY_SLUGS`), so the two
 * never meet.
 */
export function articlePath(slug: string): string {
  return `${ALL_ARTICLES_PATH}/${slug}`;
}

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
