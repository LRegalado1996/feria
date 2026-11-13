import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { stubIntersectionObserver } from "@/test/intersection-observer";

import { useInfiniteScroll } from "./use-infinite-scroll";

type Input = Parameters<typeof useInfiniteScroll>[0];

function setup({
  intersectionObserver = true,
  ...overrides
}: Partial<Input> & { intersectionObserver?: boolean } = {}) {
  const observers = stubIntersectionObserver();

  if (!intersectionObserver) {
    vi.stubGlobal("IntersectionObserver", undefined);
  }

  const onLoadMore = vi.fn(() => undefined);
  const sentinel = document.createElement("div");
  const view = renderHook((props: Input) => useInfiniteScroll(props), {
    initialProps: {
      hasNextPage: true,
      isFetching: false,
      onLoadMore,
      ...overrides,
    },
  });

  const attach = () => {
    act(() => {
      view.result.current(sentinel);
    });
  };

  return { attach, observers, onLoadMore, sentinel, view };
}

describe("useInfiniteScroll", () => {
  test("watches the sentinel 200px ahead of the viewport", () => {
    const { attach, observers, sentinel } = setup();

    attach();

    expect(observers.active()?.observed).toEqual([sentinel]);
    expect(observers.active()?.rootMargin).toBe("200px");
  });

  test("watches with the margin it is given", () => {
    const { attach, observers } = setup({ rootMargin: "0px 0px 400px" });

    attach();

    expect(observers.active()?.rootMargin).toBe("0px 0px 400px");
  });

  test("loads more when the sentinel comes into view, not when it leaves", () => {
    const { attach, observers, onLoadMore } = setup();
    attach();

    act(() => {
      observers.active()?.emit(false);
    });
    expect(onLoadMore).not.toHaveBeenCalled();

    act(() => {
      observers.active()?.emit(true);
    });
    // `onLoadMore` takes no arguments: pinned as one call with none.
    expect(onLoadMore).toHaveBeenCalledExactlyOnceWith();
  });

  test("watches nothing while a page is in flight or when there is no next page", () => {
    const { attach, observers, onLoadMore, view } = setup({
      isFetching: true,
    });
    attach();

    expect(observers.instances).toEqual([]);

    view.rerender({ hasNextPage: false, isFetching: false, onLoadMore });

    expect(observers.instances).toEqual([]);
  });

  test("re-observes when a page lands, so a sentinel still in view keeps loading", () => {
    const { attach, observers, onLoadMore, view } = setup();
    attach();
    const first = observers.active();

    view.rerender({ hasNextPage: true, isFetching: true, onLoadMore });
    view.rerender({ hasNextPage: true, isFetching: false, onLoadMore });

    expect(first?.disconnected).toBe(true);
    expect(observers.active()).not.toBe(first);
    act(() => {
      observers.active()?.emit(true);
    });
    expect(onLoadMore).toHaveBeenCalledExactlyOnceWith();
  });

  test("calls the newest onLoadMore without rebuilding the observer", () => {
    const { attach, observers, onLoadMore, view } = setup();
    attach();
    const observer = observers.active();
    const latest = vi.fn(() => undefined);

    view.rerender({ hasNextPage: true, isFetching: false, onLoadMore: latest });
    act(() => {
      observers.active()?.emit(true);
    });

    expect(observers.active()).toBe(observer);
    expect(latest).toHaveBeenCalledExactlyOnceWith();
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  test("stops watching on unmount", () => {
    const { attach, observers, view } = setup();
    attach();
    const observer = observers.active();

    view.unmount();

    expect(observer?.disconnected).toBe(true);
  });

  test("does nothing where IntersectionObserver does not exist", () => {
    const { attach, onLoadMore } = setup({ intersectionObserver: false });

    expect(attach).not.toThrow();
    expect(onLoadMore).not.toHaveBeenCalled();
  });
});
