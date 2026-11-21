import { useInfiniteQuery } from "@tanstack/react-query";

import type { CatalogQuery } from "@/lib/catalog/query";
import { useInfiniteScroll } from "@/lib/hooks/ui";
import type { Locale } from "@/lib/i18n/config";
import { type client, orpc } from "@/lib/orpc/client";
import type { ListProductsValues, ProductCursor } from "@/lib/schemas/catalog";

export type CatalogPage = Awaited<ReturnType<typeof client.catalog.products>>;

/**
 * How far below the window the end of the grid counts as near (FER-044):
 * about two rows of cards on a phone, so the next page is usually there
 * before the shopper reaches the last one.
 */
const NEAR_THE_END = "0px 0px 800px 0px";

/**
 * A catalog selection's articles, a page at a time (FER-023), starting from
 * the page the server already rendered: the first one, or the one after
 * `startCursor` when the address carried it (the "Cargar más" link followed
 * without the script, FER-044). `attachSentinel` loads the next page as its
 * element nears the window; a failed page stops that until `fetchNextPage`
 * is called, so a persistent failure never loops.
 */
export function useCatalogProducts({
  firstPage,
  locale,
  query,
  startCursor = null,
}: {
  firstPage: CatalogPage;
  locale: Locale;
  query: CatalogQuery;
  startCursor?: ProductCursor | null;
}) {
  const initialPageParam: ListProductsValues["cursor"] =
    startCursor ?? undefined;
  const result = useInfiniteQuery({
    ...orpc.catalog.products.infiniteOptions({
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      // Part of the query's key: a page that started further down is not
      // the first page's list.
      initialPageParam,
      input: (cursor) => ({
        category: query.category?.slug,
        cursor,
        filters: query.filters,
        locale,
        q: query.q ?? undefined,
        sort: query.sort,
      }),
    }),
    initialData: {
      pageParams: [initialPageParam],
      pages: [firstPage],
    },
  });
  const attachSentinel = useInfiniteScroll({
    hasNextPage: result.hasNextPage && !result.isFetchNextPageError,
    isFetching: result.isFetchingNextPage,
    onLoadMore: () => {
      // A failure lands in the query's state, which the grid renders.
      void result.fetchNextPage();
    },
    rootMargin: NEAR_THE_END,
  });
  const { pages } = result.data;

  return {
    attachSentinel,
    fetchNextPage: () => {
      void result.fetchNextPage();
    },
    hasNextPage: result.hasNextPage,
    isFetchNextPageError: result.isFetchNextPageError,
    isFetchingNextPage: result.isFetchingNextPage,
    items: pages.flatMap((page) => page.items),
    /** The page after the last one loaded, for the link that asks for it. */
    nextCursor: pages.at(-1)?.nextCursor ?? null,
    /** How many pages the browser added to the server's, and the last's size. */
    loaded: { added: pages.length - 1, last: pages.at(-1)?.items.length ?? 0 },
  };
}
