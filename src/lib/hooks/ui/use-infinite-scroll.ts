import { useEffect, useEffectEvent, useState } from "react";

interface UseInfiniteScrollInput {
  hasNextPage: boolean;
  /** A page is in flight: a sentinel parked in view must not queue another. */
  isFetching: boolean;
  onLoadMore: () => void;
  /** How far below the viewport the sentinel counts as visible. */
  rootMargin?: string;
}

/**
 * Returns a callback ref for a sentinel at the end of a list; `onLoadMore`
 * fires whenever it comes into view.
 *
 * An IntersectionObserver reports only transitions, so a sentinel still on
 * screen when a page lands would never report again and the list would stall
 * one page in. The observer is rebuilt whenever `hasNextPage` or `isFetching`
 * flips, and a fresh `observe()` always reports the current intersection,
 * which resumes the chain. Without IntersectionObserver it does nothing.
 */
export function useInfiniteScroll({
  hasNextPage,
  isFetching,
  onLoadMore,
  rootMargin = "200px",
}: UseInfiniteScrollInput) {
  const [sentinel, setSentinel] = useState<Element | null>(null);
  const loadMore = useEffectEvent(onLoadMore);

  useEffect(() => {
    if (
      !(sentinel && hasNextPage) ||
      isFetching ||
      typeof IntersectionObserver === "undefined"
    ) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin }
    );
    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [sentinel, hasNextPage, isFetching, rootMargin]);

  return setSentinel;
}
