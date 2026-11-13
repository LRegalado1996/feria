import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Toaster } from "@/app/_components/molecules/sonner";
import { reportError } from "@/lib/errors/client";
import { collectHydrationErrors } from "@/test/hydration";
import { stubIntersectionObserver } from "@/test/intersection-observer";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { PostFeed } from "./post-feed";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const NOW = new Date("2024-06-15T12:00:00Z").getTime();
const MINUTE = 60 * 1000;
const USER = { id: "viewer", name: "Test User", image: null };

// The last post's sort key, as the JSON wire carries it.
const NEXT_CURSOR = { createdAt: "2024-06-15T11:00:00.000Z", id: 1 };

// The feed's cache entry, as `useGetPosts` keys it through the client mock.
const FEED_KEY = ["post", "getAll", { input: { cursor: undefined } }];

const FAILURE = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

// What the client funnel receives when a call answers FAILURE.
const REPORTED_FAILURE = expect.objectContaining({
  code: FAILURE.code,
  message: FAILURE.message,
});

function makePost(
  id: number,
  name: string,
  ageMs = 5 * MINUTE,
  authorId = `user-${id}`
) {
  return {
    id,
    name,
    createdAt: new Date(NOW - ageMs).toISOString(),
    updatedAt: new Date(NOW - ageMs).toISOString(),
    createdById: authorId,
    createdBy: { id: authorId, name: `Author ${id}`, image: null },
  };
}

function page(
  items: ReturnType<typeof makePost>[],
  nextCursor: typeof NEXT_CURSOR | null = null
) {
  return { items, nextCursor };
}

const hang = async () => await new Promise<never>(() => {});

type Answer = "fail" | ((input: unknown) => unknown);

interface SetupOptions {
  /** `post.create`'s answer: a resolver, or `"fail"` for a 500. */
  create?: Answer;
  /** `post.delete`'s answer: a resolver, or `"fail"` for a 500. */
  remove?: Answer;
  /** `post.getAll`'s answer: a resolver, or `"fail"` for a 500. */
  getAll?: Answer;
  signedIn?: boolean;
}

function answer(path: string, value: Answer) {
  const spy = vi.fn(value === "fail" ? () => undefined : value);

  return {
    handler:
      value === "fail"
        ? createOrpcErrorHandler(path, FAILURE)
        : createOrpcHandler(path, spy),
    spy,
  };
}

function setup({
  create = (input) => ({ id: 99, input }),
  getAll = () => page([]),
  remove = (input) => input,
  signedIn = true,
}: SetupOptions = {}) {
  vi.setSystemTime(NOW);
  const observers = stubIntersectionObserver();
  const feed = answer("post.getAll", getAll);
  const post = answer("post.create", create);
  const deletion = answer("post.delete", remove);
  server.use(feed.handler, post.handler, deletion.handler);

  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const user = userEvent.setup();

  render(
    <>
      <PostFeed currentUser={signedIn ? USER : undefined} renderedAt={NOW} />
      <Toaster />
    </>,
    { wrapper }
  );

  const compose = () => screen.getByRole("textbox", { name: "New post" });

  const submitPost = async (text: string) => {
    await user.type(compose(), text);
    await user.click(screen.getByRole("button", { name: "Post" }));
  };

  return {
    compose,
    createPost: post.spy,
    deletePost: deletion.spy,
    getAllPosts: feed.spy,
    invalidateQueries,
    observers,
    submitPost,
    user,
  };
}

describe("PostFeed states", () => {
  test("shows three busy card skeletons while the first page loads", () => {
    setup({ getAll: hang });

    const skeleton = screen.getByTestId("feed-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(within(skeleton).getAllByTestId("post-card-skeleton")).toHaveLength(
      3
    );
    expect(within(skeleton).getByRole("status")).toHaveTextContent(
      "Loading posts"
    );
  });

  test("says the feed is empty only when the first page has no posts", async () => {
    setup();

    expect(await screen.findByTestId("empty-state")).toHaveTextContent(
      "No posts yet. Be the first to post!"
    );
    expect(screen.queryByTestId("scroll-sentinel")).not.toBeInTheDocument();
  });

  test("says a failed feed failed, never that it is empty, and retries", async () => {
    const { user } = setup({ getAll: "fail" });

    const error = await screen.findByTestId("feed-error");
    expect(error).toHaveAttribute("role", "alert");
    expect(error).toHaveTextContent("The feed did not load.");
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();

    server.use(
      createOrpcHandler("post.getAll", () => page([makePost(1, "Back again")]))
    );
    await user.click(within(error).getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Back again")).toBeInTheDocument();
  });

  test("lists posts newest first with their author and age", async () => {
    setup({
      getAll: () =>
        page([
          makePost(2, "Second post", 5 * MINUTE),
          makePost(1, "First post", 120 * MINUTE),
        ]),
    });

    const cards = await screen.findAllByTestId("post-card");
    expect(
      cards.map((card) => [
        within(card).getByText(/^Author/).textContent,
        within(card).getByText(/post$/).textContent,
        within(card).getByText(/ago$/).textContent,
      ])
    ).toEqual([
      ["Author 2", "Second post", "5 minutes ago"],
      ["Author 1", "First post", "2 hours ago"],
    ]);
  });

  test("offers the compose box only to a signed-in user", async () => {
    setup({ signedIn: false });

    expect(await screen.findByTestId("empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("compose-area")).not.toBeInTheDocument();
  });
});

describe("PostFeed infinite scroll", () => {
  test("asks for the next page by cursor when the sentinel comes into view", async () => {
    const { getAllPosts, observers } = setup({
      getAll: (input) =>
        JSON.stringify(input) === "{}"
          ? page([makePost(2, "Newest")], NEXT_CURSOR)
          : page([makePost(1, "Older")]),
    });

    const sentinel = await screen.findByTestId("scroll-sentinel");
    await waitFor(() => {
      expect(observers.active()?.observed).toEqual([sentinel]);
    });

    observers.active()?.emit(true);

    expect(await screen.findByText("Older")).toBeInTheDocument();
    expect(getAllPosts.mock.calls).toEqual([[{}], [{ cursor: NEXT_CURSOR }]]);
  });

  test("keeps the posts when an older page fails, and retries it on demand", async () => {
    const { observers, user } = setup({
      getAll: () => page([makePost(2, "Newest")], NEXT_CURSOR),
    });
    const sentinel = await screen.findByTestId("scroll-sentinel");
    await waitFor(() => {
      expect(observers.active()?.observed).toEqual([sentinel]);
    });
    server.use(createOrpcErrorHandler("post.getAll", FAILURE));

    observers.active()?.emit(true);

    const error = await screen.findByTestId("feed-more-error");
    expect(error).toHaveTextContent("Older posts did not load.");
    expect(screen.getByText("Newest")).toBeInTheDocument();

    server.use(
      createOrpcHandler("post.getAll", () => page([makePost(1, "Older")]))
    );
    await user.click(within(error).getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Older")).toBeInTheDocument();
    expect(screen.queryByTestId("feed-more-error")).not.toBeInTheDocument();
  });
});

describe("PostFeed compose", () => {
  test("labels the box and keeps the visible focus ring", () => {
    const { compose } = setup({ getAll: hang });

    expect(compose()).toHaveAttribute("placeholder", "What's happening?");
    expect(compose()).toHaveClass("focus-visible:ring-[3px]");
    expect(compose()).not.toHaveClass("focus-visible:ring-0");
  });

  test("shows the new post before the server answers, and keeps the text until it does", async () => {
    const { compose, createPost, submitPost } = setup({ create: hang });
    await screen.findByTestId("empty-state");

    await submitPost("New Post");

    expect(
      await within(screen.getByTestId("post-list")).findByText("New Post")
    ).toBeInTheDocument();
    expect(createPost).toHaveBeenCalledExactlyOnceWith({ name: "New Post" });
    expect(compose()).toHaveValue("New Post");
    expect(screen.getByRole("button", { name: "Posting…" })).toBeDisabled();
  });

  test("clears the box and refreshes the feed once the post is saved", async () => {
    const { compose, createPost, invalidateQueries, submitPost } = setup();

    await submitPost("New Post");

    await waitFor(() => {
      expect(compose()).toHaveValue("");
    });
    expect(createPost).toHaveBeenCalledExactlyOnceWith({ name: "New Post" });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: FEED_KEY });
  });

  test("a refused post keeps what the user typed, says so, and leaves the feed as it was", async () => {
    const { compose, submitPost } = setup({
      create: "fail",
      getAll: () => page([makePost(1, "Existing post")]),
    });
    await screen.findByText("Existing post");

    await submitPost("Failing post");

    expect(
      await screen.findByText("Your post was not published. Try again.")
    ).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(REPORTED_FAILURE, {
      action: "Post.create",
    });
    expect(compose()).toHaveValue("Failing post");
    const cards = screen.getAllByTestId("post-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Existing post");
    expect(screen.getByRole("button", { name: "Post" })).toBeEnabled();
  });
});

const OWN_AND_OTHERS = () =>
  page([
    makePost(2, "My weekend plans", 5 * MINUTE, USER.id),
    makePost(1, "Someone else's post"),
  ]);

/** Opens the row menu of the viewer's post and picks Delete. */
async function askToDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", {
      name: "More actions: My weekend plans",
    })
  );
  await user.click(
    screen.getByRole("menuitem", { name: "Delete: My weekend plans" })
  );

  return screen.getByRole("dialog", { name: "Delete this post?" });
}

describe("PostFeed delete", () => {
  test("offers the menu on the viewer's own posts only", async () => {
    setup({ getAll: OWN_AND_OTHERS });

    await screen.findByText("Someone else's post");

    expect(screen.getAllByTestId(/^post-actions-/)).toHaveLength(1);
    expect(screen.getByTestId("post-actions-2")).toHaveAccessibleName(
      "More actions: My weekend plans"
    );
  });

  test("names a long post by its opening words", async () => {
    setup({
      getAll: () =>
        page([
          makePost(
            3,
            `${"A".repeat(39)} and then a much longer tail`,
            0,
            USER.id
          ),
        ]),
    });

    expect(await screen.findByTestId("post-actions-3")).toHaveAccessibleName(
      `More actions: ${"A".repeat(39)}…`
    );
  });

  test("offers no menu on a post still being saved", async () => {
    const { submitPost } = setup({ create: hang });
    await screen.findByTestId("empty-state");

    await submitPost("Not saved yet");

    expect(
      await within(screen.getByTestId("post-list")).findByText("Not saved yet")
    ).toBeInTheDocument();
    expect(screen.queryByTestId(/^post-actions-/)).not.toBeInTheDocument();
  });

  test("deletes only after the user confirms, then says so", async () => {
    const { deletePost, user } = setup({ getAll: OWN_AND_OTHERS });

    const dialog = await askToDelete(user);
    expect(deletePost).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Post deleted.")).toBeInTheDocument();
    expect(deletePost).toHaveBeenCalledExactlyOnceWith({ id: 2 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("cancelling keeps the post and puts focus back on its menu", async () => {
    const { deletePost, user } = setup({ getAll: OWN_AND_OTHERS });

    const dialog = await askToDelete(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("My weekend plans")).toBeInTheDocument();
    expect(screen.getByTestId("post-actions-2")).toHaveFocus();
    expect(deletePost).not.toHaveBeenCalled();
  });

  test("a refused delete puts the post back and says it was not deleted", async () => {
    const { user } = setup({ getAll: OWN_AND_OTHERS, remove: "fail" });

    const dialog = await askToDelete(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText("The post was not deleted. Try again.")
    ).toBeInTheDocument();
    expect(screen.getByText("My weekend plans")).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(REPORTED_FAILURE, {
      action: "Post.delete",
    });
  });

  test("keeps the dialog up, saying so, while the delete runs", async () => {
    const { user } = setup({ getAll: OWN_AND_OTHERS, remove: hang });

    const dialog = await askToDelete(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      await within(dialog).findByRole("button", { name: "Deleting…" })
    ).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

// The feed as the server rendered it: its first page already in the cache.
function setupHydration() {
  const wrapper = createQueryWrapper();
  wrapper.queryClient.setQueryData(FEED_KEY, {
    pages: [page([makePost(1, "Fresh post", 5000)])],
    pageParams: [undefined],
  });
  server.use(
    createOrpcHandler("post.getAll", () =>
      page([makePost(1, "Fresh post", 5000)])
    )
  );

  return wrapper({
    children: <PostFeed currentUser={USER} renderedAt={NOW} />,
  });
}

describe("PostFeed hydration", () => {
  test("prints the server's ages while hydrating, then the browser's", () => {
    const element = setupHydration();

    // The browser hydrates 7 s after the server rendered.
    const outcome = collectHydrationErrors(element, {
      serverNowMs: NOW,
      clientNowMs: NOW + 7000,
    });

    expect(outcome.errors).toEqual([]);
    expect(outcome.serverHtml).toContain("5 seconds ago");
    expect(outcome.clientHtml).toContain("12 seconds ago");
  });
});
