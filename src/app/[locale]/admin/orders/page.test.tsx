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
import type { OrderManagerProps } from "@/app/_components/organisms/order-manager";
import type { requireAdmin as RequireAdmin } from "@/lib/admin/access";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import OrdersPage from "./page";

type SearchParams = Record<string, string | string[] | undefined>;

interface OrdersParams {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}

const RENDERED_AT = Date.parse("2026-11-14T22:00:00.000Z");

const PAGE = {
  items: [{ code: "K7P2Q", id: 4 }],
  nextCursor: { createdAt: "2026-11-14T21:00:00.000Z", id: 4 },
};
const COUNTS = { delivered: 0, packed: 1, received: 2, undeliverable: 0 };

const {
  connection,
  counts,
  countsOptions,
  infiniteOptions,
  list,
  managerProps,
  requireAdmin,
  shellProps,
} = vi.hoisted(() => {
  const listMock = vi.fn(async (_input: unknown): Promise<unknown> => null);
  const countsMock = vi.fn(async (): Promise<unknown> => null);

  return {
    connection: vi.fn(async () => {
      await Promise.resolve();
    }),
    counts: countsMock,
    countsOptions: vi.fn(() => ({
      queryFn: async () => await countsMock(),
      queryKey: ["order", "counts"],
    })),
    infiniteOptions: vi.fn(
      ({
        getNextPageParam,
        initialPageParam,
        input,
      }: {
        getNextPageParam: (lastPage: {
          nextCursor: (typeof PAGE)["nextCursor"] | null;
        }) => unknown;
        initialPageParam: unknown;
        input: (cursor: unknown) => unknown;
      }) => ({
        getNextPageParam,
        initialPageParam,
        queryFn: async ({ pageParam }: { pageParam: unknown }) =>
          await listMock(input(pageParam)),
        queryKey: ["order", "list", { input: input(initialPageParam) }],
      })
    ),
    list: listMock,
    managerProps: vi.fn<(props: OrderManagerProps) => void>(),
    requireAdmin: vi.fn<typeof RequireAdmin>(),
    shellProps: vi.fn<(props: Omit<AdminShellProps, "children">) => void>(),
  };
});

// The clock is read after `connection()`, which needs a request.
vi.mock("next/server", () => ({ connection }));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The session check has its own tests; here it answers with the login, or
// sends the visitor to the sign-in page the way the real one does.
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));

vi.mock("@/lib/orpc/server", async () => {
  const { QueryClient: Client } = await import("@tanstack/react-query");
  return {
    getQueryClient: () => new Client(),
    orpc: {
      order: {
        counts: { queryOptions: countsOptions },
        list: { infiniteOptions },
      },
    },
  };
});

// The shell has its own tests; here it records what the page handed it,
// and shows the counts it finds in the cache the page hydrated above it.
vi.mock("@/app/_components/organisms/admin-shell", () => ({
  AdminShell: ({ children, ...props }: AdminShellProps) => {
    shellProps(props);
    const cached = useQueryClient().getQueryData(["order", "counts"]);
    return (
      <div data-testid="admin-shell">
        <p data-testid="shell-counts">{JSON.stringify(cached ?? null)}</p>
        {children}
      </div>
    );
  },
}));

// The manager has its own tests; here it records its props and shows the
// first page it finds in the cache.
vi.mock("@/app/_components/organisms/order-manager", () => ({
  OrderManager: (props: OrderManagerProps) => {
    managerProps(props);
    const cached = useQueryClient()
      .getQueryCache()
      .findAll({ queryKey: ["order", "list"] })
      .map((query) => query.state.data);
    return <div data-testid="order-manager">{JSON.stringify(cached)}</div>;
  },
}));

type Boundary<P> = ReactElement<{
  children: ReactElement<P, (props: P) => Promise<ReactNode>>;
  fallback: ReactNode;
}>;

/** The list's input as the page sends it: no store, the session's is used. */
function makeListInput(overrides: { q?: string; status?: string } = {}) {
  return { cursor: undefined, q: undefined, status: undefined, ...overrides };
}

/**
 * The page's boundary for `/admin/orders`: its fallback, and what it streams
 * once resolved, with a session or without one.
 */
function setup({
  locale = "en",
  prefetchFails = false,
  searchParams = {},
  signedIn = true,
}: {
  locale?: string;
  prefetchFails?: boolean;
  searchParams?: SearchParams;
  signedIn?: boolean;
} = {}) {
  vi.setSystemTime(RENDERED_AT);
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

    return await Promise.resolve(PAGE);
  });
  counts.mockImplementation(async () => {
    if (prefetchFails) {
      throw new Error("database unavailable");
    }

    return await Promise.resolve(COUNTS);
  });
  const page: Boundary<OrdersParams> = OrdersPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(searchParams),
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

describe("OrdersPage", () => {
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
    ["en", {}, "/en/admin/orders"],
    ["es", {}, "/admin/orders"],
    ["es", { q: "ana", status: "packed" }, "/admin/orders?status=packed&q=ana"],
  ] as const)(
    "in %s with %j, checks the session coming back to this selection, before fetching anything",
    async (locale, searchParams, returnTo) => {
      const { show } = setup({ locale, searchParams });

      await show();

      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
      const sessionAt = requireAdmin.mock.invocationCallOrder[0] ?? 0;
      expect(sessionAt).toBeLessThan(list.mock.invocationCallOrder[0] ?? 0);
      expect(sessionAt).toBeLessThan(counts.mock.invocationCallOrder[0] ?? 0);
    }
  );

  test("sends a visitor without a session to the sign-in, fetching nothing", async () => {
    const { resolve } = setup({
      locale: "es",
      searchParams: { status: "received" },
      signedIn: false,
    });

    await expect(resolve()).rejects.toMatchObject({
      digest:
        "NEXT_REDIRECT;replace;/admin/sign-in?next=%2Fadmin%2Forders%3Fstatus%3Dreceived;307;",
    });
    expect(list).not.toHaveBeenCalled();
    expect(counts).not.toHaveBeenCalled();
    expect(shellProps).not.toHaveBeenCalled();
  });

  test.each(["en", "es"] as const)(
    "in %s, opens the orders section with the first page and the counts already fetched, above the shell",
    async (locale) => {
      const { show } = setup({ locale });

      await show();

      expect(shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        login: { email: "ada@example.com", name: "Ada Admin" },
        section: "orders",
      });
      expect(connection).toHaveBeenCalledExactlyOnceWith();
      expect(managerProps).toHaveBeenCalledExactlyOnceWith({
        query: {},
        renderedAt: RENDERED_AT,
      });
      expect(list).toHaveBeenCalledExactlyOnceWith(makeListInput());
      // No input: the store is the one the procedure takes from the session.
      expect(countsOptions).toHaveBeenCalledExactlyOnceWith();
      expect(counts).toHaveBeenCalledExactlyOnceWith();
      expect(screen.getByTestId("shell-counts")).toHaveTextContent(
        JSON.stringify(COUNTS)
      );
      const manager = within(screen.getByTestId("admin-shell")).getByTestId(
        "order-manager"
      );
      expect(JSON.parse(manager.textContent)).toEqual([
        { pageParams: [null], pages: [PAGE] },
      ]);
    }
  );

  test("reads the status and the search from the address, dropping a status that is not one", async () => {
    const { show } = setup({
      searchParams: { q: "  ana ", status: "shipped" },
    });

    await show();

    expect(managerProps).toHaveBeenCalledExactlyOnceWith({
      query: { q: "ana" },
      renderedAt: RENDERED_AT,
    });
    expect(list).toHaveBeenCalledExactlyOnceWith(makeListInput({ q: "ana" }));
  });

  test("hands a known status to the list and the screen", async () => {
    const { show } = setup({ searchParams: { status: "received" } });

    await show();

    expect(managerProps).toHaveBeenCalledExactlyOnceWith({
      query: { status: "received" },
      renderedAt: RENDERED_AT,
    });
    expect(list).toHaveBeenCalledExactlyOnceWith(
      makeListInput({ status: "received" })
    );
  });

  test("pages from the last page's cursor, and stops at the end", async () => {
    const { show } = setup();

    await show();

    const [options] = infiniteOptions.mock.calls[0] ?? [];
    expect(options?.getNextPageParam(PAGE)).toEqual(PAGE.nextCursor);
    expect(
      options?.getNextPageParam({ ...PAGE, nextCursor: null })
    ).toBeUndefined();
  });

  test("still opens the screen when the prefetch fails, leaving the fetch to it", async () => {
    const { show } = setup({ prefetchFails: true });

    await show();

    expect(list).toHaveBeenCalledExactlyOnceWith(makeListInput());
    expect(screen.getByTestId("shell-counts")).toHaveTextContent(/^null$/u);
    expect(screen.getByTestId("order-manager")).toHaveTextContent(/^\[\]$/u);
  });
});
