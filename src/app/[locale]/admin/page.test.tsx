import { render, screen, within } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { AdminShellProps } from "@/app/_components/organisms/admin-shell";
import type { requireAdmin as RequireAdmin } from "@/lib/admin/access";
import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import AdminHome from "./page";

type Me = Awaited<ReturnType<typeof RequireAdmin>>;
type AdminStore = Me["stores"][number];

const { requireAdmin, shellProps } = vi.hoisted(() => ({
  requireAdmin: vi.fn<typeof RequireAdmin>(),
  shellProps: vi.fn<(props: Omit<AdminShellProps, "children">) => void>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The session check has its own tests; here it answers with the login.
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));

// The shell has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/admin-shell", () => ({
  AdminShell: ({ children, ...props }: AdminShellProps) => {
    shellProps(props);
    return <div data-testid="admin-shell">{children}</div>;
  },
}));

type Boundary<P> = ReactElement<{
  children: ReactElement<P, (props: P) => Promise<ReactNode>>;
  fallback: ReactNode;
}>;

function makeStore(overrides: Partial<AdminStore> = {}): AdminStore {
  return {
    id: 1,
    isActive: true,
    name: "LR Market",
    slug: "lr-market",
    ...overrides,
  };
}

function makeMe(overrides: Partial<Me> = {}): Me {
  return { name: "Ada Admin", role: "member", stores: [], ...overrides };
}

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

/** The page's boundary: its fallback, and what it streams once resolved. */
async function setup({
  locale = "en",
  me = makeMe(),
}: { locale?: Locale; me?: Me } = {}) {
  requireAdmin.mockResolvedValue(me);
  const page: Boundary<{ locale: Locale }> = await AdminHome({
    params: makeParams(locale),
  });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    landing: async () => {
      render(await inner.type(inner.props));
    },
    resolve: async () => await inner.type(inner.props),
  };
}

describe("AdminHome", () => {
  test.each([
    ["en", "Loading"],
    ["es", "Cargando"],
  ] as const)(
    "in %s, waits for the session behind the shell's skeleton, before any check",
    async (locale, loading) => {
      requireAdmin.mockResolvedValue(makeMe());
      const page: Boundary<{ locale: Locale }> = await AdminHome({
        params: makeParams(locale),
      });

      renderWithI18n(<div>{page.props.fallback}</div>, { locale });

      expect(screen.getByTestId("admin-shell-skeleton")).toHaveTextContent(
        new RegExp(`^${loading}$`, "u")
      );
      expect(page.props.children.props).toEqual({ locale });
      expect(requireAdmin).not.toHaveBeenCalled();
    }
  );

  test("answers 404 for a language the product does not speak", async () => {
    await expect(AdminHome({ params: makeParams("fr") })).rejects.toMatchObject(
      { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }
    );
  });

  test.each([
    ["en", "/en/admin"],
    ["es", "/admin"],
  ] as const)(
    "in %s, checks the session, coming back to the landing at %s",
    async (locale, returnTo) => {
      const { landing } = await setup({
        locale,
        me: makeMe({ stores: [makeStore(), makeStore({ slug: "other" })] }),
      });

      await landing();

      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
    }
  );

  test.each([
    ["en", "/en/admin/platform/stores"],
    ["es", "/admin/platform/stores"],
  ] as const)(
    "in %s, sends a superadmin to the platform's stores, however many stores it has",
    async (locale, to) => {
      const { resolve } = await setup({
        locale,
        me: makeMe({ role: "superadmin", stores: [makeStore()] }),
      });

      await expect(resolve()).rejects.toMatchObject({
        digest: `NEXT_REDIRECT;replace;${to};307;`,
      });
    }
  );

  test.each([
    ["en", "/en/admin/lr-market/products"],
    ["es", "/admin/lr-market/products"],
  ] as const)(
    "in %s, sends a member of one store to that store's articles",
    async (locale, to) => {
      const { resolve } = await setup({
        locale,
        me: makeMe({ stores: [makeStore()] }),
      });

      await expect(resolve()).rejects.toMatchObject({
        digest: `NEXT_REDIRECT;replace;${to};307;`,
      });
    }
  );

  test.each([
    [
      "en",
      "Choose a store",
      "Inactive",
      [
        ["LR Market", "/en/admin/lr-market/products"],
        ["Sample StoreInactive", "/en/admin/sample-store/products"],
      ],
    ],
    [
      "es",
      "Elegí una tienda",
      "Inactiva",
      [
        ["LR Market", "/admin/lr-market/products"],
        ["Sample StoreInactiva", "/admin/sample-store/products"],
      ],
    ],
  ] as const)(
    "in %s, offers a member of several stores a choice, marking an inactive one",
    async (locale, title, inactive, links) => {
      const stores = [
        makeStore(),
        makeStore({
          id: 2,
          isActive: false,
          name: "Sample Store",
          slug: "sample-store",
        }),
      ];
      const { landing } = await setup({ locale, me: makeMe({ stores }) });

      await landing();

      const picker = screen.getByTestId("admin-store-picker");
      expect(
        within(picker).getByRole("heading", { level: 1 })
      ).toHaveTextContent(new RegExp(`^${title}$`, "u"));
      expect(
        within(picker).getByText(DICTIONARIES[locale].admin.landing.pickBody)
      ).toBeInTheDocument();
      expect(
        within(picker)
          .getAllByRole("link")
          .map((link) => [link.textContent, link.getAttribute("href")])
      ).toEqual(links);
      expect(
        within(picker)
          .getAllByText(inactive)
          .map((marker) => marker.closest("a")?.getAttribute("href"))
      ).toEqual([links[1][1]]);
      expect(screen.getByTestId("admin-shell")).toContainElement(picker);
      expect(shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        location: { kind: "landing" },
        role: "member",
        stores,
      });
    }
  );

  test.each([
    ["en", "You don't have a store yet"],
    ["es", "Todavía no tenés una tienda"],
  ] as const)(
    "in %s, tells a member of no store so, with no store to pick",
    async (locale, title) => {
      const { landing } = await setup({ locale });

      await landing();

      const message = screen.getByTestId("admin-no-stores");
      expect(
        within(message).getByRole("heading", { level: 1 })
      ).toHaveTextContent(new RegExp(`^${title}$`, "u"));
      expect(within(message).getByTestId("empty-state")).toHaveTextContent(
        DICTIONARIES[locale].admin.landing.noStoresBody
      );
      expect(
        screen.queryByTestId("admin-store-picker")
      ).not.toBeInTheDocument();
      expect(shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        location: { kind: "landing" },
        role: "member",
        stores: [],
      });
    }
  );
});
