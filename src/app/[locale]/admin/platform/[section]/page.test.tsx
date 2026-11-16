import { render, screen, within } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { AdminShellProps } from "@/app/_components/organisms/admin-shell";
import type { requireAdmin as RequireAdmin } from "@/lib/admin/access";
import type { Locale } from "@/lib/i18n/config";
import type { UserRole } from "@/lib/schemas/access";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import PlatformSection from "./page";

type Me = Awaited<ReturnType<typeof RequireAdmin>>;

interface PlatformSectionParams {
  params: Promise<{ locale: string; section: string }>;
}

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

function makeMe(role: UserRole): Me {
  return {
    name: "Ada Admin",
    role,
    stores: [{ id: 1, isActive: true, name: "LR Market", slug: "lr-market" }],
  };
}

async function makeParams(locale: string, section: string) {
  return await Promise.resolve({ locale, section });
}

/** The page's boundary: its fallback, and what it streams once resolved. */
function setup({
  locale = "en",
  role = "superadmin",
  section = "stores",
}: { locale?: string; role?: UserRole; section?: string } = {}) {
  const me = makeMe(role);
  requireAdmin.mockResolvedValue(me);
  const page: Boundary<PlatformSectionParams> = PlatformSection({
    params: makeParams(locale, section),
  });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    me,
    resolve: async () => await inner.type(inner.props),
    show: async () => {
      render(await inner.type(inner.props));
    },
  };
}

describe("PlatformSection", () => {
  test("waits behind the shell's skeleton, without reading the params", () => {
    const { fallback } = setup();

    renderWithI18n(<div>{fallback}</div>);

    expect(screen.getByTestId("admin-shell-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test.each(["orders", "Stores", "settings"])(
    "answers 404 for %j, not a platform section, before any session check",
    async (section) => {
      const { resolve } = setup({ section });

      await expect(resolve()).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
      expect(requireAdmin).not.toHaveBeenCalled();
    }
  );

  test("answers a member the same 404, after checking the session", async () => {
    const { resolve } = setup({ role: "member", section: "users" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/platform/users",
      "en"
    );
    expect(shellProps).not.toHaveBeenCalled();
  });

  test.each([
    ["en", "stores", "/en/admin/platform/stores", "Stores", "Coming soon"],
    ["en", "metrics", "/en/admin/platform/metrics", "Metrics", "Coming soon"],
    ["es", "users", "/admin/platform/users", "Usuarios", "Próximamente"],
  ] as const satisfies [Locale, string, string, string, string][])(
    "in %s, shows a superadmin the %s section inside the shell, coming back to %s",
    async (locale, section, returnTo, title, status) => {
      const { me, show } = setup({ locale, section });

      await show();

      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
      const placeholder = within(screen.getByTestId("admin-shell")).getByTestId(
        "admin-placeholder"
      );
      expect(
        within(placeholder).getByRole("heading", { level: 1 })
      ).toHaveTextContent(new RegExp(`^${title}$`, "u"));
      expect(placeholder).toHaveTextContent(
        `${title}${status}${DICTIONARIES[locale].admin.comingSoon.body}`
      );
      expect(shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        location: { kind: "platform", section },
        role: "superadmin",
        stores: me.stores,
      });
    }
  );
});
