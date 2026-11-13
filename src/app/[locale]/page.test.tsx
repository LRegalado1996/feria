import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { getGravatarUrl } from "@/lib/utils/get-gravatar-url";
import { DICTIONARIES } from "@/test/i18n";

import Home, { generateMetadata, HomeResolver } from "./page";

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

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

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
vi.mock("@/app/_components/molecules/locale-toggle", () => ({
  LocaleToggle: () => <div data-testid="locale-toggle" />,
}));

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

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

async function setup(
  session: unknown,
  {
    locale = "en",
    prefetchFails = false,
  }: { locale?: Locale; prefetchFails?: boolean } = {}
) {
  vi.setSystemTime(NOW);
  getSession.mockResolvedValue(session);

  if (prefetchFails) {
    fetchPage.mockRejectedValueOnce(new Error("database unavailable"));
  }

  render(await HomeResolver({ dictionary: DICTIONARIES[locale] }), {
    wrapper: QueryProvider,
  });
}

async function setupShell(locale: string) {
  const page: ReactElement<{
    children: ReactElement<{ dictionary: Dictionary }>;
    fallback: ReactNode;
  }> = await Home({ params: makeParams(locale) });

  render(page.props.fallback);

  return { resolverProps: page.props.children.props };
}

describe("Home page shell", () => {
  test.each([
    ["es", "Cargando"],
    ["en", "Loading"],
  ] as const)(
    "in %s, streams the session-dependent view behind an empty, busy canvas",
    async (locale, loading) => {
      const { resolverProps } = await setupShell(locale);

      expect(screen.getByTestId("home-skeleton")).toHaveAttribute(
        "aria-busy",
        "true"
      );
      expect(screen.getByRole("status")).toHaveTextContent(loading);
      expect(resolverProps.dictionary).toBe(DICTIONARIES[locale]);
      expect(getSession).not.toHaveBeenCalled();
    }
  );

  test("answers 404 for a language the product does not speak", async () => {
    await expect(setupShell("fr")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});

describe("Home page metadata", () => {
  test.each([
    ["es", "/"],
    ["en", "/en"],
  ])(
    "the %s home is canonical at %s and names both languages",
    async (locale, canonical) => {
      const metadata = await generateMetadata({ params: makeParams(locale) });

      expect(metadata).toEqual({
        alternates: {
          canonical,
          languages: { es: "/", en: "/en", "x-default": "/" },
        },
      });
    }
  );

  test("answers 404 for a language the product does not speak", async () => {
    await expect(
      generateMetadata({ params: makeParams("fr") })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});

describe("HomeResolver", () => {
  test.each([
    ["es", "Hola de nuevo", "Iniciá sesión en tu cuenta para continuar"],
    ["en", "Welcome back", "Sign in to your account to continue"],
  ] as const)(
    "in %s, shows the sign-in form and the language toggle to a signed-out visitor, without prefetching",
    async (locale, title, subtitle) => {
      await setup(null, { locale });

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        title
      );
      expect(screen.getByText(subtitle)).toBeInTheDocument();
      expect(screen.getByTestId("auth-form")).toBeInTheDocument();
      expect(screen.getByTestId("locale-toggle")).toBeInTheDocument();
      expect(screen.queryByTestId("post-feed")).not.toBeInTheDocument();
      expect(infiniteOptions).not.toHaveBeenCalled();
    }
  );

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

  test.each([
    ["es", "Usuario"],
    ["en", "User"],
  ] as const)(
    "in %s, falls back to the placeholder name %j and the Gravatar picture",
    async (locale, placeholder) => {
      await setup(
        { user: { id: "user-2", email: "bob@example.com" } },
        { locale }
      );

      expect(screen.getByTestId("navbar")).toHaveTextContent(
        `${placeholder} ${getGravatarUrl("bob@example.com")}`
      );
      expect(screen.getByTestId("post-feed")).toHaveTextContent(
        `user-2 ${placeholder} ${getGravatarUrl("bob@example.com")} @${NOW.getTime()}`
      );
    }
  );

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
