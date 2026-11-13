import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { stubIntersectionObserver } from "@/test/intersection-observer";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useGetPosts } from "./use-get-posts";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// The last post's sort key, as the JSON wire carries it.
const NEXT_CURSOR = { createdAt: "2024-06-15T11:00:00.000Z", id: 1 };

function makePost(id: number) {
  return {
    id,
    name: `Post ${id}`,
    createdAt: "2024-06-15T12:00:00.000Z",
    updatedAt: "2024-06-15T12:00:00.000Z",
    createdById: "user-1",
    createdBy: { id: "user-1", name: "Alice", image: null },
  };
}

const FAILURE = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

/** `post.getAll` answers `pages` in order, one per request, or a 500 for `"fail"`. */
function setup(pages: { items: unknown[]; nextCursor: unknown }[] | "fail") {
  const observers = stubIntersectionObserver();
  const queue = pages === "fail" ? [] : [...pages];
  const getAll = vi.fn((_input: unknown) => queue.shift());
  server.use(
    pages === "fail"
      ? createOrpcErrorHandler("post.getAll", FAILURE)
      : createOrpcHandler("post.getAll", getAll)
  );

  const wrapper = createQueryWrapper();
  const view = renderHook(() => useGetPosts(), { wrapper });
  const sentinel = document.createElement("div");

  const scrollToEnd = () => {
    act(() => {
      view.result.current.attachSentinel(sentinel);
    });
    act(() => {
      observers.active()?.emit(true);
    });
  };

  // The ids of the posts on screen, in order: the contents, not a count.
  const postIds = () => view.result.current.posts?.map((post) => post.id);

  return {
    getAll,
    observers,
    postIds,
    queryClient: wrapper.queryClient,
    scrollToEnd,
    view,
  };
}

describe("useGetPosts", () => {
  test("is pending until the first page arrives, then lists its posts", async () => {
    const { getAll, view } = setup([
      { items: [makePost(2), makePost(1)], nextCursor: null },
    ]);

    expect(view.result.current.isPending).toBe(true);
    expect(view.result.current.posts).toBeUndefined();

    await waitFor(() => {
      expect(view.result.current.posts).toEqual([makePost(2), makePost(1)]);
    });
    // The first page has no cursor; JSON drops the undefined key.
    expect(getAll).toHaveBeenCalledExactlyOnceWith({});
    expect(view.result.current.isPending).toBe(false);
    expect(view.result.current.isError).toBe(false);
    expect(view.result.current.queryKey).toEqual([
      "post",
      "getAll",
      { input: { cursor: undefined } },
    ]);
  });

  test("loads the next page by cursor when the sentinel comes into view", async () => {
    const { getAll, postIds, scrollToEnd } = setup([
      { items: [makePost(2)], nextCursor: NEXT_CURSOR },
      { items: [makePost(1)], nextCursor: null },
    ]);
    await waitFor(() => {
      expect(postIds()).toEqual([2]);
    });

    scrollToEnd();

    await waitFor(() => {
      expect(postIds()).toEqual([2, 1]);
    });
    expect(getAll.mock.calls).toEqual([[{}], [{ cursor: NEXT_CURSOR }]]);
  });

  test("reports a failed first page as an error, never as an empty feed", async () => {
    const { view } = setup("fail");

    await waitFor(() => {
      expect(view.result.current.isError).toBe(true);
    });
    expect(view.result.current.posts).toBeUndefined();
    expect(view.result.current.isPending).toBe(false);
  });

  test("keeps the posts on screen when a refresh fails", async () => {
    const { postIds, queryClient, view } = setup([
      { items: [makePost(1)], nextCursor: null },
    ]);
    await waitFor(() => {
      expect(postIds()).toEqual([1]);
    });
    server.use(createOrpcErrorHandler("post.getAll", FAILURE));

    act(() => {
      view.result.current.refetch();
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryState(view.result.current.queryKey)?.status
      ).toBe("error");
    });
    expect(view.result.current.isError).toBe(false);
    expect(postIds()).toEqual([1]);
  });

  test("retries a failed first page", async () => {
    const { postIds, view } = setup("fail");
    await waitFor(() => {
      expect(view.result.current.isError).toBe(true);
    });
    server.use(
      createOrpcHandler("post.getAll", () => ({
        items: [makePost(1)],
        nextCursor: null,
      }))
    );

    act(() => {
      view.result.current.refetch();
    });

    await waitFor(() => {
      expect(postIds()).toEqual([1]);
    });
    expect(view.result.current.isError).toBe(false);
  });

  test("keeps the posts on a failed next page, stops loading and retries on demand", async () => {
    const { observers, postIds, scrollToEnd, view } = setup([
      { items: [makePost(2)], nextCursor: NEXT_CURSOR },
    ]);
    await waitFor(() => {
      expect(postIds()).toEqual([2]);
    });
    server.use(createOrpcErrorHandler("post.getAll", FAILURE));

    scrollToEnd();

    await waitFor(() => {
      expect(view.result.current.isFetchNextPageError).toBe(true);
    });
    expect(view.result.current.isError).toBe(false);
    expect(postIds()).toEqual([2]);
    // Nothing watches the sentinel, so a failing page cannot loop.
    expect(observers.active()).toBeUndefined();

    server.use(
      createOrpcHandler("post.getAll", () => ({
        items: [makePost(1)],
        nextCursor: null,
      }))
    );
    act(() => {
      view.result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(postIds()).toEqual([2, 1]);
    });
  });
});
