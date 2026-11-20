import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { redirect } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { AdminShellProps } from "@/app/_components/organisms/admin-shell";
import type { requireAdmin as RequireAdmin } from "@/lib/admin/access";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import HomePage from "./page";

interface HomePageParams {
  params: Promise<{ locale: string }>;
}

const HOME_KEY = ["page", "get", 3] as const;

const {
  get,
  queryOptions,
  readHomePageId,
  readStore,
  requireAdmin,
  shellProps,
} = vi.hoisted(() => {
  const getMock = vi.fn(async (): Promise<unknown> => null);

  return {
    get: getMock,
    queryOptions: vi.fn((options: { input: { pageId: number } }) => ({
      queryFn: async () => await getMock(),
      queryKey: ["page", "get", options.input.pageId],
    })),
    // The store's home is its page 3 (FER-058).
    readHomePageId: vi.fn(async (_store: unknown) => 3),
    readStore: vi.fn(async (): Promise<{ id: number } | null> => ({ id: 7 })),
    requireAdmin: vi.fn<typeof RequireAdmin>(),
    shellProps: vi.fn<(props: Omit<AdminShellProps, "children">) => void>(),
  };
});

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The session check has its own tests; here it answers with the login, or
// sends the visitor to the sign-in page the way the real one does.
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));

vi.mock("@/lib/orpc/server", async () => {
  const { QueryClient: Client } = await import("@tanstack/react-query");
  return {
    getQueryClient: () => new Client(),
    orpc: { page: { get: { queryOptions } } },
  };
});

vi.mock("@/server/cache/store", () => ({ readStore }));

vi.mock("@/server/cache/page", () => ({ readHomePageId }));

// The shell has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/admin-shell", () => ({
  AdminShell: ({ children, ...props }: AdminShellProps) => {
    shellProps(props);
    return <div data-testid="admin-shell">{children}</div>;
  },
}));

// The screen has its own tests; here it shows the curation it found in the
// cache the page hydrated.
vi.mock("@/app/_components/organisms/home-curation", () => ({
  HomeCuration: ({ pageId }: { pageId: number }) => {
    const cached = useQueryClient().getQueryData([...HOME_KEY]);
    return (
      <div data-page-id={pageId} data-testid="home-curation">
        {JSON.stringify(cached ?? null)}
      </div>
    );
  },
}));

type Boundary<P> = ReactElement<{
  children: ReactElement<P, (props: P) => Promise<ReactNode>>;
  fallback: ReactNode;
}>;

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

/**
 * The page's boundary for `/admin/home`: its fallback, and what it streams
 * once resolved, with a session or without one.
 */
function setup({
  locale = "en",
  prefetchFails = false,
  signedIn = true,
}: { locale?: string; prefetchFails?: boolean; signedIn?: boolean } = {}) {
  requireAdmin.mockImplementation(async (returnTo) => {
    if (!signedIn) {
      redirect(`/admin/sign-in?next=${encodeURIComponent(returnTo)}`);
    }

    return await Promise.resolve({
      email: "ada@example.com",
      name: "Ada Admin",
    });
  });
  get.mockImplementation(async () => {
    if (prefetchFails) {
      throw new Error("database unavailable");
    }

    return await Promise.resolve({ today: "2026-11-20" });
  });
  const page: Boundary<HomePageParams> = HomePage({
    params: makeParams(locale),
  });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    resolve: async () => await inner.type(inner.props),
    show: async () => {
      render(await inner.type(inner.props), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={new QueryClient()}>
            {children}
          </QueryClientProvider>
        ),
      });
    },
  };
}

describe("HomePage", () => {
  test("waits behind the shell's skeleton, without reading the params", () => {
    const { fallback } = setup();

    renderWithI18n(<div>{fallback}</div>);

    expect(screen.getByTestId("admin-shell-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any check", async () => {
    const { resolve } = setup({ locale: "fr" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  test.each([
    ["en", "/en/admin/home"],
    ["es", "/admin/home"],
  ] as const)(
    "in %s, checks the session coming back to this page, before fetching anything",
    async (locale, returnTo) => {
      const { show } = setup({ locale });

      await show();

      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
      expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
        get.mock.invocationCallOrder[0] ?? 0
      );
    }
  );

  test("sends a visitor without a session to the sign-in, fetching nothing", async () => {
    const { resolve } = setup({ locale: "es", signedIn: false });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/admin/sign-in?next=%2Fadmin%2Fhome;307;",
    });
    expect(get).not.toHaveBeenCalled();
    expect(shellProps).not.toHaveBeenCalled();
  });

  test.each(["en", "es"] as const)(
    "in %s, opens the home section in the shell with the curation already fetched",
    async (locale) => {
      const { show } = setup({ locale });

      await show();

      expect(shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        login: { email: "ada@example.com", name: "Ada Admin" },
        section: "home",
      });
      // The page the store shows at `/` (FER-058), fetched and handed on.
      expect(readHomePageId).toHaveBeenCalledExactlyOnceWith({ id: 7 });
      expect(queryOptions).toHaveBeenCalledExactlyOnceWith({
        input: { pageId: 3 },
      });
      expect(get).toHaveBeenCalledExactlyOnceWith();
      const screenShown = within(screen.getByTestId("admin-shell")).getByTestId(
        "home-curation"
      );
      expect(screenShown).toHaveTextContent('{"today":"2026-11-20"}');
      expect(screenShown).toHaveAttribute("data-page-id", "3");
    }
  );

  test("still opens the screen when the prefetch fails, leaving the fetch to it", async () => {
    const { show } = setup({ prefetchFails: true });

    await show();

    expect(get).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByTestId("home-curation")).toHaveTextContent(/^null$/u);
  });

  test("answers 404 when the store has no row, a database whose migrations have not run", async () => {
    const { resolve } = setup();
    readStore.mockResolvedValueOnce(null);

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(get).not.toHaveBeenCalled();
  });
});
