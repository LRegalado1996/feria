import { ORPCError } from "@orpc/client";
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
import type { OrderDetailProps } from "@/app/_components/organisms/order-detail";
import type { requireAdmin as RequireAdmin } from "@/lib/admin/access";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import OrderPage from "./page";

interface OrderParams {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const RENDERED_AT = Date.parse("2026-11-14T22:00:00.000Z");
const ORDER = { code: "K7P2Q", id: 42, status: "received" };

const { connection, detailProps, get, queryOptions, requireAdmin, shellProps } =
  vi.hoisted(() => {
    const getMock = vi.fn(async (_input: unknown): Promise<unknown> => null);

    return {
      connection: vi.fn(async () => {
        await Promise.resolve();
      }),
      detailProps: vi.fn<(props: OrderDetailProps) => void>(),
      get: getMock,
      queryOptions: vi.fn(({ input }: { input: unknown }) => ({
        queryFn: async () => await getMock(input),
        queryKey: ["order", "get", { input }],
      })),
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
    orpc: { order: { get: { queryOptions } } },
  };
});

// The shell has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/admin-shell", () => ({
  AdminShell: ({ children, ...props }: AdminShellProps) => {
    shellProps(props);
    return <div data-testid="admin-shell">{children}</div>;
  },
}));

// The detail has its own tests; here it records its props and shows the
// order it finds in the cache the page hydrated.
vi.mock("@/app/_components/organisms/order-detail", () => ({
  OrderDetail: (props: OrderDetailProps) => {
    detailProps(props);
    const cached = useQueryClient().getQueryData([
      "order",
      "get",
      { input: { id: props.id } },
    ]);
    return (
      <div data-testid="order-detail">{JSON.stringify(cached ?? null)}</div>
    );
  },
}));

type Boundary<P> = ReactElement<{
  children: ReactElement<P, (props: P) => Promise<ReactNode>>;
  fallback: ReactNode;
}>;

/** What the order page hands its detail: no store, the session's is used. */
function makeDetailProps(overrides: Partial<OrderDetailProps> = {}) {
  return { from: {}, id: 42, renderedAt: RENDERED_AT, ...overrides };
}

/**
 * The page's boundary for `/admin/orders/<id>`, with a session or without
 * one; `order.get` answers the order, NOT_FOUND, or fails.
 */
function setup({
  id = "42",
  locale = "en",
  order = "found",
  searchParams = {},
  signedIn = true,
}: {
  id?: string;
  locale?: string;
  order?: "fails" | "found" | "missing";
  searchParams?: Record<string, string | string[] | undefined>;
  signedIn?: boolean;
} = {}) {
  vi.setSystemTime(RENDERED_AT);
  requireAdmin.mockImplementation(async (returnTo) => {
    if (!signedIn) {
      redirect(`/admin/sign-in?next=${encodeURIComponent(returnTo)}`);
    }

    return await Promise.resolve({ name: "Ada Admin" });
  });
  get.mockImplementation(async () => {
    if (order === "missing") {
      throw new ORPCError("NOT_FOUND", { message: "Order not found" });
    }

    if (order === "fails") {
      throw new Error("database unavailable");
    }

    return await Promise.resolve(ORDER);
  });
  const page: Boundary<OrderParams> = OrderPage({
    params: Promise.resolve({ id, locale }),
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

describe("OrderPage", () => {
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

  test.each(["0", "-1", "007", "4.2", "abc", "2147483648"])(
    "answers 404 for %j, which no order's id can be, before any session check or query",
    async (id) => {
      const { resolve } = setup({ id });

      await expect(resolve()).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
      expect(requireAdmin).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    }
  );

  test.each([
    ["1", 1],
    ["2147483647", 2_147_483_647],
  ] as const)(
    "reads %j, the edge of an order's id, as the order %i",
    async (id, expected) => {
      const { show } = setup({ id });

      await show();

      expect(get).toHaveBeenCalledExactlyOnceWith({ id: expected });
    }
  );

  test.each([
    ["en", "/en/admin/orders/42"],
    ["es", "/admin/orders/42"],
  ] as const)(
    "in %s, checks the session coming back to this order, before reading it",
    async (locale, returnTo) => {
      const { show } = setup({ locale });

      await show();

      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
      expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
        get.mock.invocationCallOrder[0] ?? 0
      );
    }
  );

  test("sends a visitor without a session to the sign-in, reading no order", async () => {
    const { resolve } = setup({ locale: "es", signedIn: false });

    await expect(resolve()).rejects.toMatchObject({
      digest:
        "NEXT_REDIRECT;replace;/admin/sign-in?next=%2Fadmin%2Forders%2F42;307;",
    });
    expect(get).not.toHaveBeenCalled();
    expect(shellProps).not.toHaveBeenCalled();
  });

  test("answers 404 for an order the store does not have", async () => {
    const { resolve } = setup({ order: "missing" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(get).toHaveBeenCalledExactlyOnceWith({ id: 42 });
    expect(shellProps).not.toHaveBeenCalled();
  });

  test.each(["en", "es"] as const)(
    "in %s, opens the order in the orders section with it already fetched",
    async (locale) => {
      const { show } = setup({ locale });

      await show();

      expect(shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        section: "orders",
      });
      expect(connection).toHaveBeenCalledExactlyOnceWith();
      expect(queryOptions).toHaveBeenCalledExactlyOnceWith({
        input: { id: 42 },
      });
      expect(detailProps).toHaveBeenCalledExactlyOnceWith(makeDetailProps());
      expect(
        within(screen.getByTestId("admin-shell")).getByTestId("order-detail")
      ).toHaveTextContent(JSON.stringify(ORDER));
    }
  );

  test("carries the list's tab and search, checked as the list checks them, to the way back and the sign-in", async () => {
    const { show } = setup({
      searchParams: { q: ["  ana  ", "beto"], status: "received" },
    });

    await show();

    expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/orders/42?status=received&q=ana",
      "en"
    );
    expect(detailProps).toHaveBeenCalledExactlyOnceWith(
      makeDetailProps({ from: { q: "ana", status: "received" } })
    );
  });

  test("drops a status no order has from the way back", async () => {
    const { show } = setup({ searchParams: { status: "shipped" } });

    await show();

    expect(detailProps).toHaveBeenCalledExactlyOnceWith(makeDetailProps());
  });

  test("a read that fails for another reason is no 404: the screen fetches it again", async () => {
    const { show } = setup({ order: "fails" });

    await show();

    expect(detailProps).toHaveBeenCalledExactlyOnceWith(makeDetailProps());
    expect(screen.getByTestId("order-detail")).toHaveTextContent(/^null$/u);
  });
});
