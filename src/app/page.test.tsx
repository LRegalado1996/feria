import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { getGravatarUrl } from "@/lib/utils/get-gravatar-url";

import Home, { HomeResolver } from "./page";

interface FeedCursor {
  createdAt: Date;
  id: number;
}

interface FeedPage {
  items: unknown[];
  nextCursor: FeedCursor | null;
}

interface FeedOptions {
  getNextPageParam: (lastPage: FeedPage) => FeedCursor | undefined;
  initialPageParam: FeedCursor | undefined;
  input: (pageParam: FeedCursor | undefined) => unknown;
}

const NOW = new Date("2024-06-15T12:00:00Z");
const CURSOR = { createdAt: new Date("2024-06-15T11:00:00Z"), id: 9 };

function makeSession(user: Record<string, string> = {}) {
  return {
    user: {
      id: "user-1",
      name: "Alice",
      image: "https://example.com/alice.png",
      email: "alice@example.com",
      ...user,
    },
  };
}

const { connection, fetchPage, getSession, infiniteOptions } = vi.hoisted(
  () => {
    const fetchPageMock = vi.fn(
      async (_input: unknown): Promise<FeedPage> =>
        await Promise.resolve({ items: [], nextCursor: null })
    );

    return {
      connection: vi.fn(async () => undefined),
      fetchPage: fetchPageMock,
      getSession: vi.fn(
        async (): Promise<unknown> => await Promise.resolve(null)
      ),
      infiniteOptions: vi.fn((options: FeedOptions) => ({
        queryKey: ["post", "getAll"],
        queryFn: async ({ pageParam }: { pageParam: FeedCursor | undefined }) =>
          await fetchPageMock(options.input(pageParam)),
        initialPageParam: options.initialPageParam,
        getNextPageParam: options.getNextPageParam,
      })),
    };
  }
);

vi.mock("next/server", () => ({ connection }));

vi.mock("@/server/better-auth/server", () => ({ getSession }));

vi.mock("@/lib/orpc/server", async () => {
  const { QueryClient: Client } = await import("@tanstack/react-query");
  return {
    getQueryClient: () => new Client(),
    orpc: { post: { getAll: { infiniteOptions } } },
  };
});

// The organisms have their own tests; here they only show what the page
// handed them.
vi.mock("@/app/_components/organisms/auth-form", () => ({
  AuthForm: () => <div data-testid="auth-form" />,
}));

vi.mock("@/app/_components/organisms/navbar", () => ({
  Navbar: ({ user }: { user: { name: string; image: string } }) => (
    <div data-testid="navbar">{`${user.name} ${user.image}`}</div>
  ),
}));

vi.mock("@/app/_components/organisms/post-feed", () => ({
  PostFeed: ({
    currentUser,
    renderedAt,
  }: {
    currentUser: { id: string; name: string; image: string };
    renderedAt: number;
  }) => (
    <div data-testid="post-feed">{`${currentUser.id} ${currentUser.name} ${currentUser.image} @${renderedAt}`}</div>
  ),
}));

function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

async function setup(session: unknown, { prefetchFails = false } = {}) {
  vi.setSystemTime(NOW);
  getSession.mockResolvedValue(session);

  if (prefetchFails) {
    fetchPage.mockRejectedValueOnce(new Error("database unavailable"));
  }

  render(await HomeResolver(), { wrapper: QueryProvider });
}

function setupShell() {
  const page: ReactElement<{ fallback: ReactNode }> = Home();

  render(page.props.fallback);
}

describe("Home page shell", () => {
  test("streams the session-dependent view behind an empty, busy canvas", () => {
    setupShell();

    expect(screen.getByTestId("home-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(getSession).not.toHaveBeenCalled();
  });
});

describe("HomeResolver", () => {
  test("shows the sign-in form to a signed-out visitor, without prefetching", async () => {
    await setup(null);

    expect(
      screen.getByRole("heading", { name: "Welcome back" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("auth-form")).toBeInTheDocument();
    expect(screen.queryByTestId("post-feed")).not.toBeInTheDocument();
    expect(infiniteOptions).not.toHaveBeenCalled();
  });

  test("shows a signed-in user the feed under their name and picture, seeded with the render instant", async () => {
    await setup(makeSession());

    expect(screen.getByTestId("navbar")).toHaveTextContent(
      "Alice https://example.com/alice.png"
    );
    expect(screen.getByTestId("post-feed")).toHaveTextContent(
      `user-1 Alice https://example.com/alice.png @${NOW.getTime()}`
    );
    expect(fetchPage).toHaveBeenCalledExactlyOnceWith({ cursor: undefined });
    expect(connection).toHaveBeenCalledExactlyOnceWith();
  });

  test("falls back to a placeholder name and the Gravatar picture", async () => {
    await setup({ user: { id: "user-2", email: "bob@example.com" } });

    expect(screen.getByTestId("navbar")).toHaveTextContent(
      `User ${getGravatarUrl("bob@example.com")}`
    );
    expect(screen.getByTestId("post-feed")).toHaveTextContent(
      `user-2 User ${getGravatarUrl("bob@example.com")} @${NOW.getTime()}`
    );
  });

  test("pages the feed by the cursor of the last page", async () => {
    await setup(makeSession());
    const options = infiniteOptions.mock.calls[0]?.[0];

    expect(options?.initialPageParam).toBeUndefined();
    expect(options?.input(CURSOR)).toEqual({ cursor: CURSOR });
    expect(options?.getNextPageParam({ items: [], nextCursor: CURSOR })).toBe(
      CURSOR
    );
    expect(
      options?.getNextPageParam({ items: [], nextCursor: null })
    ).toBeUndefined();
  });

  test("still renders the feed when the prefetch fails", async () => {
    await setup(makeSession(), { prefetchFails: true });

    expect(fetchPage).toHaveBeenCalledExactlyOnceWith({ cursor: undefined });
    expect(screen.getByTestId("post-feed")).toHaveTextContent(
      `user-1 Alice https://example.com/alice.png @${NOW.getTime()}`
    );
  });
});
