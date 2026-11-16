import { useInfiniteQuery } from "@tanstack/react-query";

import type { CatalogQuery } from "@/lib/catalog/query";
import { useInfiniteScroll } from "@/lib/hooks/ui";
import type { Locale } from "@/lib/i18n/config";
import { type client, orpc } from "@/lib/orpc/client";
import type { ListProductsValues } from "@/lib/schemas/catalog";

export type CatalogPage = Awaited<ReturnType<typeof client.catalog.products>>;

/**
 * A catalog selection's articles, a page at a time (FER-023), starting from
 * the first page the server already rendered. `attachSentinel` loads the next
 * page as its element scrolls into view; a failed page stops that until
 * `fetchNextPage` is called, so a persistent failure never loops.
 */
export function useCatalogProducts({
  firstPage,
  locale,
  query,
}: {
  firstPage: CatalogPage;
  locale: Locale;
  query: CatalogQuery;
}) {
  const result = useInfiniteQuery({
    ...orpc.catalog.products.infiniteOptions({
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: undefined as ListProductsValues["cursor"],
      input: (cursor) => ({
        category: query.category ?? undefined,
        cursor,
        filters: query.filters,
        locale,
        q: query.q ?? undefined,
        sort: query.sort,
      }),
    }),
    initialData: { pageParams: [undefined], pages: [firstPage] },
  });
  const attachSentinel = useInfiniteScroll({
    hasNextPage: result.hasNextPage && !result.isFetchNextPageError,
    isFetching: result.isFetchingNextPage,
    onLoadMore: () => {
      // A failure lands in the query's state, which the grid renders.
      void result.fetchNextPage();
    },
  });

  return {
    attachSentinel,
    fetchNextPage: () => {
      void result.fetchNextPage();
    },
    hasNextPage: result.hasNextPage,
    isFetchNextPageError: result.isFetchNextPageError,
    isFetchingNextPage: result.isFetchingNextPage,
    items: result.data.pages.flatMap((page) => page.items),
  };
}
