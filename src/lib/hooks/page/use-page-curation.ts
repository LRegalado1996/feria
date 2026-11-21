import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/**
 * The key of every page's curation, for the writes beside it: a banner or a
 * curated list shows on any page, so each write reads them all again.
 */
export function pageCurationKey() {
  return orpc.page.get.key();
}

/**
 * Everything a page's editor edits and previews (FER-020, FER-058): the
 * page's cover and blocks, and the store's announcement, banners, curated
 * articles, categories and articles to pick from.
 */
export function usePageCuration(pageId: number) {
  return useQuery(orpc.page.get.queryOptions({ input: { pageId } }));
}

/** What `page.get` answers: a page editor's data. */
export type PageCurationData = NonNullable<
  ReturnType<typeof usePageCuration>["data"]
>;
