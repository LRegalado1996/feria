import { storeTitle } from "@/lib/seo/store-metadata";

/** What a search result shows under the title, at most this long. */
export const SEARCH_DESCRIPTION_MAX = 160;

/** `text` cut at a word to fit a search result, with an ellipsis. */
export function excerpt(text: string): string {
  const flat = text.replaceAll(/\s+/gu, " ").trim();

  if (flat.length <= SEARCH_DESCRIPTION_MAX) {
    return flat;
  }

  const cut = flat.slice(0, SEARCH_DESCRIPTION_MAX - 1);
  const space = cut.lastIndexOf(" ");

  return `${space > 0 ? cut.slice(0, space) : cut}…`;
}

/**
 * An article's words for search engines and chat previews (FER-024): its own
 * search title, else its title; its own search description, else the start
 * of its description, else the store's tagline. `pageTitle` ends in the
 * store's name, as the tab and the search result show it. The article's page
 * and the wizard's preview (FER-017) both read it, so the preview shows what
 * the page will say.
 */
export function articleSearchTexts(
  article: {
    description: string;
    seoDescription: string | null;
    seoTitle: string | null;
    title: string;
  },
  store: { name: string; tagline: string | undefined }
): { description: string | undefined; pageTitle: string; title: string } {
  const title = article.seoTitle ?? article.title;

  return {
    description:
      article.seoDescription ??
      (article.description ? excerpt(article.description) : store.tagline),
    pageTitle: storeTitle(title, store.name),
    title,
  };
}
