import type { InfiniteData } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { client } from "@/lib/orpc/client";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCreatePost } from "./use-create-post";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// One page of the feed, as `post.getAll` returns it.
type PostPage = Awaited<ReturnType<typeof client.post.getAll>>;
type Feed = InfiniteData<PostPage>;

const NOW = new Date("2024-06-15T12:00:00Z");
const QUERY_KEY = ["post", "getAll"] as const;

const EXISTING = {
  id: 1,
  name: "Existing",
  createdAt: new Date("2024-06-15T11:00:00Z"),
  updatedAt: new Date("2024-06-15T11:00:00Z"),
  createdById: "user-1",
  createdBy: { id: "user-1", name: "Bob", image: "" },
};

const FEED: Feed = {
  pages: [{ items: [EXISTING], nextCursor: null }],
  pageParams: [undefined],
};

interface SetupOptions {
  /** `post.create`'s answer; `"fail"` is a 500, `"hang"` never answers. */
  answer?: "fail" | "hang" | Record<string, unknown>;
  /** No signed-in user to sign the optimistic post with. */
  anonymous?: boolean;
  /** The cached feed; `null` for none yet. */
  feed?: Feed | null;
}

function setup({
  answer = { id: 2, name: "Hello" },
  anonymous = false,
  feed = FEED,
}: SetupOptions = {}) {
  vi.setSystemTime(NOW);
  const createPost = vi.fn(async (_input: unknown) =>
    answer === "hang" ? await new Promise<never>(() => {}) : answer
  );
  server.use(
    answer === "fail"
      ? createOrpcErrorHandler("post.create", {
          code: "INTERNAL_SERVER_ERROR",
          message: "Server error",
          status: 500,
        })
      : createOrpcHandler("post.create", createPost)
  );

  const wrapper = createQueryWrapper();
  if (feed) {
    wrapper.queryClient.setQueryData(QUERY_KEY, feed);
  }

  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(
    () =>
      useCreatePost({
        queryKey: QUERY_KEY,
        currentUser: anonymous ? undefined : { name: "Alice", image: null },
      }),
    { wrapper }
  );

  const feedNow = () => wrapper.queryClient.getQueryData<Feed>(QUERY_KEY);
  const mutations = () => wrapper.queryClient.getMutationCache().getAll();

  return { createPost, feedNow, invalidateQueries, mutations, result };
}

describe("useCreatePost", () => {
  test("sends the post and resolves once it is saved, then refreshes the feed", async () => {
    const { createPost, invalidateQueries, result } = setup();

    await expect(
      result.current.mutateAsync({ name: "Hello" })
    ).resolves.toEqual({ id: 2, name: "Hello" });

    // The server received exactly what was typed, once.
    expect(createPost).toHaveBeenCalledExactlyOnceWith({ name: "Hello" });
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: QUERY_KEY,
    });
  });

  test("puts the post on top of the feed before the server answers", async () => {
    const { feedNow, result } = setup({ answer: "hang" });

    void result.current.mutateAsync({ name: "New Post" });

    await waitFor(() => {
      expect(feedNow()).toEqual({
        pages: [
          {
            items: [
              {
                // Negative: identity ids are positive, so it cannot collide
                // with one.
                id: -NOW.getTime(),
                name: "New Post",
                createdAt: NOW,
                updatedAt: NOW,
                createdById: "optimistic",
                createdBy: { id: "optimistic", name: "Alice", image: "" },
              },
              EXISTING,
            ],
            nextCursor: null,
          },
        ],
        pageParams: [undefined],
      });
    });
  });

  test("signs an optimistic post as User when nobody is known", async () => {
    const { feedNow, result } = setup({
      answer: "hang",
      anonymous: true,
    });

    void result.current.mutateAsync({ name: "Post" });

    await waitFor(() => {
      expect(feedNow()?.pages[0]?.items[0]?.createdBy).toEqual({
        id: "optimistic",
        name: "User",
        image: "",
      });
    });
  });

  test("rejects and puts the feed back when the server refuses", async () => {
    const { feedNow, invalidateQueries, result } = setup({ answer: "fail" });

    await expect(
      result.current.mutateAsync({ name: "Failing" })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Server error",
    });

    expect(feedNow()).toEqual(FEED);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: QUERY_KEY,
    });
  });

  test("creates no feed when none is cached yet", async () => {
    const { createPost, feedNow, result } = setup({ feed: null });

    await result.current.mutateAsync({ name: "Post" });

    expect(createPost).toHaveBeenCalledExactlyOnceWith({ name: "Post" });
    expect(feedNow()).toBeUndefined();
  });

  test("leaves a feed with no page untouched", async () => {
    const { createPost, feedNow, result } = setup({
      feed: { pages: [], pageParams: [] },
    });

    await result.current.mutateAsync({ name: "Post" });

    expect(createPost).toHaveBeenCalledExactlyOnceWith({ name: "Post" });
    expect(feedNow()).toEqual({ pages: [], pageParams: [] });
  });

  test("leaves reporting a failure to its caller, so it is reported once", async () => {
    const { mutations, result } = setup({ answer: "fail" });

    await expect(
      result.current.mutateAsync({ name: "Post" })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Server error",
    });

    expect(mutations().map((mutation) => mutation.meta)).toEqual([
      { suppressGlobalErrorReport: true },
    ]);
  });
});
