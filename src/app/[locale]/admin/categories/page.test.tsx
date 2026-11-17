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

import CategoriesPage from "./page";

interface CategoriesPageParams {
  params: Promise<{ locale: string }>;
}

const LIST_KEY = ["category", "list"] as const;

const { list, queryOptions, requireAdmin, shellProps } = vi.hoisted(() => {
  const listMock = vi.fn(async (): Promise<unknown> => []);

  return {
    list: listMock,
    queryOptions: vi.fn(() => ({
      queryFn: async () => await listMock(),
      queryKey: ["category", "list"],
    })),
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
    orpc: { category: { list: { queryOptions } } },
  };
});

// The shell has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/admin-shell", () => ({
  AdminShell: ({ children, ...props }: AdminShellProps) => {
    shellProps(props);
    return <div data-testid="admin-shell">{children}</div>;
  },
}));

// The manager has its own tests; here it shows the list it found in the
// cache the page hydrated.
vi.mock("@/app/_components/organisms/category-manager", () => ({
  CategoryManager: () => {
    const cached = useQueryClient().getQueryData([...LIST_KEY]);
    return (
      <div data-testid="category-manager">{JSON.stringify(cached ?? null)}</div>
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
 * The page's boundary for `/admin/categories`: its fallback, and what it
 * streams once resolved, with a session or without one.
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
  list.mockImplementation(async () => {
    if (prefetchFails) {
      throw new Error("database unavailable");
    }

    return await Promise.resolve([{ id: 4, nameEs: "Collares" }]);
  });
  const page: Boundary<CategoriesPageParams> = CategoriesPage({
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

describe("CategoriesPage", () => {
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
    expect(list).not.toHaveBeenCalled();
  });

  test.each([
    ["en", "/en/admin/categories"],
    ["es", "/admin/categories"],
  ] as const)(
    "in %s, checks the session coming back to this page, before fetching anything",
    async (locale, returnTo) => {
      const { show } = setup({ locale });

      await show();

      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
      expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
        list.mock.invocationCallOrder[0] ?? 0
      );
    }
  );

  test("sends a visitor without a session to the sign-in, fetching nothing", async () => {
    const { resolve } = setup({ locale: "es", signedIn: false });

    await expect(resolve()).rejects.toMatchObject({
      digest:
        "NEXT_REDIRECT;replace;/admin/sign-in?next=%2Fadmin%2Fcategories;307;",
    });
    expect(list).not.toHaveBeenCalled();
    expect(shellProps).not.toHaveBeenCalled();
  });

  test.each(["en", "es"] as const)(
    "in %s, opens the categories section in the shell with the store's list already fetched",
    async (locale) => {
      const { show } = setup({ locale });

      await show();

      expect(shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        login: { email: "ada@example.com", name: "Ada Admin" },
        section: "categories",
      });
      // No input: the store is the one the procedure takes from the session.
      expect(queryOptions).toHaveBeenCalledExactlyOnceWith();
      expect(list).toHaveBeenCalledExactlyOnceWith();
      expect(
        within(screen.getByTestId("admin-shell")).getByTestId(
          "category-manager"
        )
      ).toHaveTextContent('[{"id":4,"nameEs":"Collares"}]');
    }
  );

  test("still opens the screen when the prefetch fails, leaving the fetch to it", async () => {
    const { show } = setup({ prefetchFails: true });

    await show();

    expect(list).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByTestId("category-manager")).toHaveTextContent(/^null$/u);
  });
});
