import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { AdminShellProps } from "@/app/_components/organisms/admin-shell";
import type { MetricsDashboardProps } from "@/app/_components/organisms/metrics-dashboard";
import type { requireAdmin as RequireAdmin } from "@/lib/admin/access";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import MetricsPage from "./page";

type SearchParams = Record<string, string | string[] | undefined>;

interface MetricsParams {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}

type Boundary<Props> = ReactElement<{
  children: ReactElement<Props, (props: Props) => Promise<ReactNode>>;
  fallback: ReactNode;
}>;

// 23:59:59 on December 5 in Montevideo, already December 6 in UTC.
const NOW = "2026-12-06T02:59:59.000Z";
const DASHBOARD = { funnel: { orders: 4, views: 30, visits: 20 } };

const { connection, dashboard, dashboardProps, requireAdmin, shellProps } =
  vi.hoisted(() => ({
    connection: vi.fn(async () => {
      await Promise.resolve();
    }),
    dashboard: vi.fn(async (_input: unknown): Promise<unknown> => null),
    dashboardProps: vi.fn<(props: MetricsDashboardProps) => void>(),
    requireAdmin: vi.fn<typeof RequireAdmin>(),
    shellProps: vi.fn<(props: Omit<AdminShellProps, "children">) => void>(),
  }));

// The clock is read after `connection()`, which needs a request.
vi.mock("next/server", () => ({ connection }));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The session check has its own tests; here it answers with the login, or
// sends the visitor to the sign-in page the way the real one does.
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));

// The procedure has its own tests; here it answers what it was asked.
vi.mock("@/lib/orpc/server", () => ({
  caller: { metrics: { dashboard } },
}));

// The shell and the dashboard have their own tests; here they record what
// the page handed them.
vi.mock("@/app/_components/organisms/admin-shell", () => ({
  AdminShell: ({ children, ...props }: AdminShellProps) => {
    shellProps(props);

    return <div data-testid="admin-shell">{children}</div>;
  },
}));

vi.mock("@/app/_components/organisms/metrics-dashboard", () => ({
  MetricsDashboard: (props: MetricsDashboardProps) => {
    dashboardProps(props);

    return <div data-testid="metrics-dashboard" />;
  },
}));

/** The page's boundary for `/admin/metrics`, with a session or without. */
function setup({
  locale = "en",
  searchParams = {},
  signedIn = true,
}: {
  locale?: string;
  searchParams?: SearchParams;
  signedIn?: boolean;
} = {}) {
  vi.setSystemTime(new Date(NOW));
  requireAdmin.mockImplementation(async (returnTo) => {
    if (!signedIn) {
      redirect(`/admin/sign-in?next=${encodeURIComponent(returnTo)}`);
    }

    return await Promise.resolve({
      email: "ada@example.com",
      name: "Ada Admin",
    });
  });
  dashboard.mockResolvedValue(DASHBOARD);
  const page: Boundary<MetricsParams> = MetricsPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(searchParams),
  });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    resolve: async () => await inner.type(inner.props),
    show: async () => {
      render(await inner.type(inner.props));
    },
  };
}

describe("MetricsPage", () => {
  test("waits behind the shell's skeleton, without reading anything", () => {
    const { fallback } = setup();

    renderWithI18n(<div>{fallback}</div>);

    expect(screen.getByTestId("admin-shell-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(dashboard).not.toHaveBeenCalled();
  });

  test("opens on the last 30 days ending today in Montevideo, coming back to the bare screen after signing in", async () => {
    const { show } = setup();

    await show();

    expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/metrics",
      "en"
    );
    expect(dashboard).toHaveBeenCalledExactlyOnceWith({
      from: "2026-11-06",
      locale: "en",
      to: "2026-12-05",
    });
  });

  test("reads the range the address names, in the page's language, and hands the dashboard all of it", async () => {
    const { show } = setup({
      locale: "es",
      searchParams: { from: "2026-11-01", to: "2026-11-30" },
    });

    await show();

    expect(dashboard).toHaveBeenCalledExactlyOnceWith({
      from: "2026-11-01",
      locale: "es",
      to: "2026-11-30",
    });
    expect(shellProps).toHaveBeenCalledExactlyOnceWith({
      dictionary: DICTIONARIES.es.admin,
      locale: "es",
      login: { email: "ada@example.com", name: "Ada Admin" },
      section: "metrics",
    });
    expect(dashboardProps).toHaveBeenCalledExactlyOnceWith({
      copy: DICTIONARIES.es.admin.metrics,
      dashboard: DASHBOARD,
      locale: "es",
      range: { from: "2026-11-01", to: "2026-11-30" },
      statuses: DICTIONARIES.es.admin.orders.statuses,
      today: "2026-12-05",
    });
    expect(screen.getByTestId("admin-shell")).toContainElement(
      screen.getByTestId("metrics-dashboard")
    );
  });

  test.each([
    [
      "a range",
      { from: "2026-11-01", to: "2026-11-30" },
      "/en/admin/metrics?from=2026-11-01&to=2026-11-30",
    ],
    [
      "half a range, read as the last 30 days",
      { from: "2026-11-01" },
      "/en/admin/metrics?from=2026-11-06&to=2026-12-05",
    ],
  ])(
    "an address naming %s comes back to it after signing in",
    async (_case, searchParams, returnTo) => {
      const { resolve } = setup({ searchParams });

      await resolve();

      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, "en");
    }
  );

  test("reads the clock only once the request arrived", async () => {
    const { resolve } = setup();

    await resolve();

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(connection.mock.invocationCallOrder[0]).toBeLessThan(
      dashboard.mock.invocationCallOrder[0] ?? 0
    );
  });

  test("sends a visitor without a session to the sign-in, reading nothing", async () => {
    const { resolve } = setup({
      locale: "es",
      searchParams: { from: "2026-11-01", to: "2026-11-30" },
      signedIn: false,
    });

    await expect(resolve()).rejects.toMatchObject({
      digest:
        "NEXT_REDIRECT;replace;/admin/sign-in?next=%2Fadmin%2Fmetrics%3Ffrom%3D2026-11-01%26to%3D2026-11-30;307;",
    });
    expect(dashboard).not.toHaveBeenCalled();
    expect(shellProps).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any check", async () => {
    const { resolve } = setup({ locale: "fr" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(dashboard).not.toHaveBeenCalled();
  });
});
