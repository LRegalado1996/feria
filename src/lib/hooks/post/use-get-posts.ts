import { useInfiniteQuery } from "@tanstack/react-query";

import { useInfiniteScroll } from "@/lib/hooks/ui";
import { orpc } from "@/lib/orpc/client";
import type { GetPostsValues } from "@/lib/schemas/post";

/**
 * The feed, newest first, a page at a time. `attachSentinel`, a callback ref,
 * loads the next page as its element scrolls into view; a failed next page
 * stops that until `fetchNextPage` is called again, so a persistent failure
 * never loops.
 */
export function useGetPosts() {
  const infiniteOptions = orpc.post.getAll.infiniteOptions({
    input: (pageParam) => ({ cursor: pageParam }),
    initialPageParam: undefined as GetPostsValues["cursor"],
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchNextPageError,
    isFetchingNextPage,
    isPending,
    refetch,
  } = useInfiniteQuery(infiniteOptions);

  const attachSentinel = useInfiniteScroll({
    hasNextPage: hasNextPage && !isFetchNextPageError,
    isFetching: isFetchingNextPage,
    onLoadMore: () => {
      // A failure lands in the query's state, which the feed renders.
      void fetchNextPage();
    },
  });

  return {
    posts: data?.pages.flatMap((page) => page.items),
    /** Nothing to show yet: the first page is loading. */
    isPending,
    /**
     * The feed failed and there is nothing to show but the error. A failed
     * refresh of posts already on screen keeps them; it is only reported.
     */
    isError: isError && data === undefined,
    /** A later page failed; the posts so far stay on screen. */
    isFetchNextPageError,
    isFetchingNextPage,
    // Retries. A failure lands in the query's state, which the feed renders.
    refetch: () => {
      void refetch();
    },
    fetchNextPage: () => {
      void fetchNextPage();
    },
    attachSentinel,
    queryKey: infiniteOptions.queryKey,
  };
}
