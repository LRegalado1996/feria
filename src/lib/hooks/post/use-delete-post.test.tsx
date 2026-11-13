import type { InfiniteData } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { client } from "@/lib/orpc/client";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useDeletePost } from "./use-delete-post";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

type Feed = InfiniteData<Awaited<ReturnType<typeof client.post.getAll>>>;

const QUERY_KEY = ["post", "getAll"] as const;

function makePost(id: number) {
  return {
    id,
    name: `Post ${id}`,
    createdAt: new Date("2024-06-15T12:00:00Z"),
    updatedAt: new Date("2024-06-15T12:00:00Z"),
    createdById: "user-1",
    createdBy: { id: "user-1", name: "Alice", image: "" },
  };
}

// Two pages, so removal is proven across the whole feed, not the first page.
const FEED: Feed = {
  pages: [
    { items: [makePost(3), makePost(2)], nextCursor: null },
    { items: [makePost(1)], nextCursor: null },
  ],
  pageParams: [undefined, undefined],
};

/** `answer` is `post.delete`'s: `"saved"`, a 404 `"refused"`, or `"hang"`. */
function setup({
  answer = "saved",
  feed = FEED,
}: { answer?: "hang" | "refused" | "saved"; feed?: Feed | null } = {}) {
  const deletePost = vi.fn(async (input: unknown) =>
    answer === "hang" ? await new Promise<never>(() => {}) : input
  );
  server.use(
    answer === "refused"
      ? createOrpcErrorHandler("post.delete", {
          code: "NOT_FOUND",
          message: "Post not found",
          status: 404,
        })
      : createOrpcHandler("post.delete", deletePost)
  );

  const wrapper = createQueryWrapper();

  if (feed) {
    wrapper.queryClient.setQueryData(QUERY_KEY, feed);
  }

  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useDeletePost({ queryKey: QUERY_KEY }), {
    wrapper,
  });

  const ids = () =>
    wrapper.queryClient
      .getQueryData<Feed>(QUERY_KEY)
      ?.pages.map((page) => page.items.map((item) => item.id));

  const mutations = () => wrapper.queryClient.getMutationCache().getAll();

  return { deletePost, ids, invalidateQueries, mutations, result };
}

describe("useDeletePost", () => {
  test("takes the post off the feed before the server answers", async () => {
    const { deletePost, ids, result } = setup({ answer: "hang" });

    void result.current.mutateAsync({ id: 1 });

    await waitFor(() => {
      expect(ids()).toEqual([[3, 2], []]);
    });
    expect(result.current.isPending).toBe(true);
    expect(deletePost).toHaveBeenCalledExactlyOnceWith({ id: 1 });
  });

  test("resolves once deleted, then refreshes the feed", async () => {
    const { deletePost, ids, invalidateQueries, result } = setup();

    await expect(result.current.mutateAsync({ id: 2 })).resolves.toEqual({
      id: 2,
    });

    expect(deletePost).toHaveBeenCalledExactlyOnceWith({ id: 2 });
    expect(ids()).toEqual([[3], [1]]);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: QUERY_KEY,
    });
  });

  test("rejects and puts the post back when the server refuses, then refreshes", async () => {
    const { ids, invalidateQueries, result } = setup({ answer: "refused" });

    await expect(result.current.mutateAsync({ id: 2 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Post not found",
    });

    expect(ids()).toEqual([[3, 2], [1]]);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: QUERY_KEY,
    });
  });

  test("leaves reporting a failure to its caller, so it is reported once", async () => {
    const { mutations, result } = setup({ answer: "refused" });

    await expect(result.current.mutateAsync({ id: 2 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Post not found",
    });

    expect(mutations().map((mutation) => mutation.meta)).toEqual([
      { suppressGlobalErrorReport: true },
    ]);
  });

  test("creates no feed when none is cached yet", async () => {
    const { deletePost, ids, result } = setup({ feed: null });

    await result.current.mutateAsync({ id: 2 });

    expect(deletePost).toHaveBeenCalledExactlyOnceWith({ id: 2 });
    expect(ids()).toBeUndefined();
  });
});
