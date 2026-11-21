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
import type { ComingSoonManagerProps } from "@/app/_components/organisms/coming-soon-manager";
import type { requireAdmin as RequireAdmin } from "@/lib/admin/access";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import ComingSoonAdminPage from "./page";

interface PageParams {
  params: Promise<{ locale: string }>;
}

const PAGE_KEY = ["comingSoon", "get"] as const;

const { get, managerProps, queryOptions, requireAdmin, shellProps } =
  vi.hoisted(() => {
    const getMock = vi.fn(async (): Promise<unknown> => null);

    return {
      get: getMock,
      managerProps: vi.fn<(props: ComingSoonManagerProps) => void>(),
      queryOptions: vi.fn(() => ({
        queryFn: async () => await getMock(),
        queryKey: ["comingSoon", "get"],
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
    orpc: { comingSoon: { get: { queryOptions } } },
  };
});

// The shell has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/admin-shell", () => ({
  AdminShell: ({ children, ...props }: AdminShellProps) => {
    shellProps(props);
    return <div data-testid="admin-shell">{children}</div>;
  },
}));

// The manager has its own tests; here it shows the page it found in the
// cache the page hydrated, and records the defaults it was handed.
vi.mock("@/app/_components/organisms/coming-soon-manager", () => ({
  ComingSoonManager: (props: ComingSoonManagerProps) => {
    managerProps(props);
    const cached = useQueryClient().getQueryData([...PAGE_KEY]);
    return (
      <div data-testid="coming-soon-manager">
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
 * The page's boundary for `/admin/settings/coming-soon`: its fallback, and what it
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
  get.mockImplementation(async () => {
    if (prefetchFails) {
      throw new Error("database unavailable");
    }

    return await Promise.resolve({ published: true });
  });
  const page: Boundary<PageParams> = ComingSoonAdminPage({
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

describe("ComingSoonAdminPage", () => {
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
    ["en", "/en/admin/settings/coming-soon"],
    ["es", "/admin/settings/coming-soon"],
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
      digest:
        "NEXT_REDIRECT;replace;/admin/sign-in?next=%2Fadmin%2Fsettings%2Fcoming-soon;307;",
    });
    expect(get).not.toHaveBeenCalled();
    expect(shellProps).not.toHaveBeenCalled();
  });

  test.each(["en", "es"] as const)(
    "in %s, opens under the settings in the shell with the page already fetched",
    async (locale) => {
      const { show } = setup({ locale });

      await show();

      expect(shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        login: { email: "ada@example.com", name: "Ada Admin" },
        section: "settings",
      });
      expect(queryOptions).toHaveBeenCalledExactlyOnceWith();
      expect(
        within(screen.getByTestId("admin-shell")).getByTestId(
          "coming-soon-manager"
        )
      ).toHaveTextContent('{"published":true}');
    }
  );

  test("hands the screen what the page says in each language where a field is empty, whatever the admin's language", async () => {
    const { show } = setup({ locale: "en" });

    await show();

    expect(managerProps).toHaveBeenCalledExactlyOnceWith({
      defaults: {
        en: {
          eyebrow: "Christmas fair · December 5 to January 5",
          headline: "Opening\nsoon",
          lead: "Jewelry and bubble guns. We are setting up the store: follow us and find out when it opens.",
          marquee: "Jewelry and bubble guns\nChristmas fair\nDec 5 to Jan 5",
        },
        es: {
          eyebrow: "Feria navideña · 5 de diciembre al 5 de enero",
          headline: "Muy\npronto",
          lead: "Bijou y pistolas de burbujas. Estamos armando la tienda: seguinos y enterate cuando abra.",
          marquee:
            "Bijou y pistolas de burbujas\nFeria navideña\n5 dic al 5 ene",
        },
      },
    });
  });

  test("still opens the screen when the prefetch fails, leaving the fetch to it", async () => {
    const { show } = setup({ prefetchFails: true });

    await show();

    expect(get).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByTestId("coming-soon-manager")).toHaveTextContent(
      /^null$/u
    );
  });
});
