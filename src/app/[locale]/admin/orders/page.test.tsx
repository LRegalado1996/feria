import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { AdminShellProps } from "@/app/_components/organisms/admin-shell";
import type { OrderManagerProps } from "@/app/_components/organisms/order-manager";
import type {
  AdminProfile,
  requireAdmin as RequireAdmin,
  requireAdminStore as RequireAdminStore,
  requireStoreSegment as RequireStoreSegment,
} from "@/lib/admin/access";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import OrdersPage from "./page";

type AdminStore = ReturnType<typeof RequireAdminStore>;

type SearchParams = Record<string, string | string[] | undefined>;

interface OrdersParams {
  params: Promise<{ locale: string; store: string }>;
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
  requireAdminStore,
  requireStoreSegment,
  shellProps,
} = vi.hoisted(() => {
  const listMock = vi.fn(async (_input: unknown): Promise<unknown> => null);
  const countsMock = vi.fn(async (_input: unknown): Promise<unknown> => null);

  return {
    connection: vi.fn(async () => {
      await Promise.resolve();
    }),
    counts: countsMock,
    countsOptions: vi.fn(({ input }: { input: unknown }) => ({
      queryFn: async () => await countsMock(input),
      queryKey: ["order", "counts", { input }],
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
    requireAdminStore: vi.fn<typeof RequireAdminStore>(),
    requireStoreSegment: vi.fn<typeof RequireStoreSegment>(),
    shellProps: vi.fn<(props: Omit<AdminShellProps, "children">) => void>(),
  };
});

// The clock is read after `connection()`, which needs a request.
vi.mock("next/server", () => ({ connection }));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The checks have their own tests; here they answer with the login and the
// store, and are spied on for what the page asked.
vi.mock("@/lib/admin/access", () => ({
  requireAdmin,
  requireAdminStore,
  requireStoreSegment,
}));

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
    const cached = useQueryClient().getQueryData([
      "order",
      "counts",
      { input: { storeSlug: "lr-market" } },
    ]);
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

function makeStore(): AdminStore {
  return { id: 1, isActive: true, name: "LR Market", slug: "lr-market" };
}

function makeMe(): AdminProfile {
  return { name: "Ada Admin", role: "member", stores: [makeStore()] };
}

/**
 * The page's boundary for `/admin/<store>/orders`: its fallback, and what it
 * streams once resolved. The segment check passes any segment but
 * "Bad Segment"; the store check answers 404 for any store but the login's.
 */
function setup({
  locale = "en",
  prefetchFails = false,
  searchParams = {},
  store = "lr-market",
}: {
  locale?: string;
  prefetchFails?: boolean;
  searchParams?: SearchParams;
  store?: string;
} = {}) {
  vi.setSystemTime(RENDERED_AT);
  const me = makeMe();
  const found = makeStore();
  requireAdmin.mockResolvedValue(me);
  requireStoreSegment.mockImplementation((segment) => {
    if (segment === "Bad Segment") {
      notFound();
    }

    return segment;
  });
  requireAdminStore.mockImplementation((_profile, slug) => {
    if (slug !== found.slug) {
      notFound();
    }

    return found;
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
    params: Promise.resolve({ locale, store }),
    searchParams: Promise.resolve(searchParams),
  });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    found,
    me,
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

  test("answers 404 for a segment that is not a store address, before any session check", async () => {
    const { resolve } = setup({ store: "Bad Segment" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any check", async () => {
    const { resolve } = setup({ locale: "fr" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireStoreSegment).not.toHaveBeenCalled();
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test.each([
    ["en", {}, "/en/admin/lr-market/orders"],
    ["es", {}, "/admin/lr-market/orders"],
    [
      "es",
      { q: "ana", status: "packed" },
      "/admin/lr-market/orders?status=packed&q=ana",
    ],
  ] as const)(
    "in %s with %j, checks the session coming back to this selection, then the store",
    async (locale, searchParams, returnTo) => {
      const { me, show } = setup({ locale, searchParams });

      await show();

      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
      expect(requireAdminStore).toHaveBeenCalledExactlyOnceWith(
        me,
        "lr-market"
      );
      const [sessionAt = 0, storeAt = 0] = [
        requireAdmin,
        requireAdminStore,
      ].map((check) => check.mock.invocationCallOrder[0]);
      expect(sessionAt).toBeLessThan(storeAt);
    }
  );

  test("answers 404 for a store the login may not work on, fetching nothing", async () => {
    const { resolve } = setup({ store: "sample-store" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(list).not.toHaveBeenCalled();
    expect(counts).not.toHaveBeenCalled();
    expect(shellProps).not.toHaveBeenCalled();
  });

  test.each(["en", "es"] as const)(
    "in %s, opens the orders section with the first page and the counts already fetched, above the shell",
    async (locale) => {
      const { found, me, show } = setup({ locale });

      await show();

      expect(shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        location: { kind: "store", section: "orders", store: found },
        role: "member",
        stores: me.stores,
      });
      expect(connection).toHaveBeenCalledExactlyOnceWith();
      expect(managerProps).toHaveBeenCalledExactlyOnceWith({
        query: {},
        renderedAt: RENDERED_AT,
        storeSlug: "lr-market",
      });
      expect(list).toHaveBeenCalledExactlyOnceWith({
        cursor: undefined,
        q: undefined,
        status: undefined,
        storeSlug: "lr-market",
      });
      expect(counts).toHaveBeenCalledExactlyOnceWith({
        storeSlug: "lr-market",
      });
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
      storeSlug: "lr-market",
    });
    expect(list).toHaveBeenCalledExactlyOnceWith({
      cursor: undefined,
      q: "ana",
      status: undefined,
      storeSlug: "lr-market",
    });
  });

  test("hands a known status to the list and the screen", async () => {
    const { show } = setup({ searchParams: { status: "received" } });

    await show();

    expect(managerProps).toHaveBeenCalledExactlyOnceWith({
      query: { status: "received" },
      renderedAt: RENDERED_AT,
      storeSlug: "lr-market",
    });
    expect(list).toHaveBeenCalledExactlyOnceWith({
      cursor: undefined,
      q: undefined,
      status: "received",
      storeSlug: "lr-market",
    });
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

    expect(list).toHaveBeenCalledExactlyOnceWith({
      cursor: undefined,
      q: undefined,
      status: undefined,
      storeSlug: "lr-market",
    });
    expect(screen.getByTestId("shell-counts")).toHaveTextContent(/^null$/u);
    expect(screen.getByTestId("order-manager")).toHaveTextContent(/^\[\]$/u);
  });
});
