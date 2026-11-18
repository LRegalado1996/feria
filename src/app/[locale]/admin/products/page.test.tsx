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

import ProductsPage from "./page";

interface ProductsPageParams {
  params: Promise<{ locale: string }>;
}

const LIST_KEY = ["product", "list"] as const;
const FIRST_PAGE = {
  currencyCode: "UYU",
  items: [{ id: 9, title: "Anillo" }],
  nextCursor: { id: 9, updatedAt: "2026-11-15T09:30:00.000Z" },
};

const { infiniteOptions, list, requireAdmin, shellProps } = vi.hoisted(() => {
  const listMock = vi.fn(async (_input: unknown): Promise<unknown> => null);

  return {
    infiniteOptions: vi.fn(
      (options: {
        getNextPageParam: (page: { nextCursor: unknown }) => unknown;
        initialPageParam: unknown;
        input: (cursor: unknown) => unknown;
      }) => ({
        ...options,
        queryFn: async ({ pageParam }: { pageParam: unknown }) =>
          await listMock(options.input(pageParam)),
        queryKey: ["product", "list"],
      })
    ),
    list: listMock,
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
    orpc: { product: { list: { infiniteOptions } } },
  };
});

// The shell has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/admin-shell", () => ({
  AdminShell: ({ children, ...props }: AdminShellProps) => {
    shellProps(props);
    return <div data-testid="admin-shell">{children}</div>;
  },
}));

// The list has its own tests; here it shows the pages it found in the
// cache the page hydrated.
vi.mock("@/app/_components/organisms/product-list", () => ({
  ProductList: () => {
    const cached = useQueryClient().getQueryData([...LIST_KEY]);
    return (
      <div data-testid="product-list">{JSON.stringify(cached ?? null)}</div>
    );
  },
}));

type Boundary<P> = ReactElement<{
  children: ReactElement<P, (props: P) => Promise<ReactNode>>;
  fallback: ReactNode;
}>;

/**
 * The page's boundary for `/admin/products`: its fallback, and what it
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

    return await Promise.resolve(FIRST_PAGE);
  });
  const page: Boundary<ProductsPageParams> = ProductsPage({
    params: Promise.resolve({ locale }),
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

describe("ProductsPage", () => {
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
    ["en", "/en/admin/products"],
    ["es", "/admin/products"],
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
        "NEXT_REDIRECT;replace;/admin/sign-in?next=%2Fadmin%2Fproducts;307;",
    });
    expect(list).not.toHaveBeenCalled();
    expect(shellProps).not.toHaveBeenCalled();
  });

  test.each(["en", "es"] as const)(
    "in %s, opens the articles section with the first page already fetched",
    async (locale) => {
      const { show } = setup({ locale });

      await show();

      expect(shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        login: { email: "ada@example.com", name: "Ada Admin" },
        section: "products",
      });
      // The first page, without a cursor, as `useProducts` asks for it.
      expect(list).toHaveBeenCalledExactlyOnceWith({ cursor: undefined });
      expect(
        within(screen.getByTestId("admin-shell")).getByTestId("product-list")
      ).toHaveTextContent(
        JSON.stringify({ pages: [FIRST_PAGE], pageParams: [null] })
      );
    }
  );

  test("reads the next page from the last one's cursor, and none after the end", async () => {
    const { show } = setup();
    await show();
    const [[options] = []] = infiniteOptions.mock.calls;

    expect(options?.getNextPageParam(FIRST_PAGE)).toEqual(
      FIRST_PAGE.nextCursor
    );
    expect(options?.getNextPageParam({ nextCursor: null })).toBeUndefined();
    expect(options?.initialPageParam).toBeUndefined();
  });

  test("still opens the screen when the prefetch fails, leaving the fetch to it", async () => {
    const { show } = setup({ prefetchFails: true });

    await show();

    expect(list).toHaveBeenCalledExactlyOnceWith({ cursor: undefined });
    expect(screen.getByTestId("product-list")).toHaveTextContent(/^null$/u);
  });
});
