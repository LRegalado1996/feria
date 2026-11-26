import { render, screen, within } from "@testing-library/react";
import { redirect } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { AdminShellProps } from "@/app/_components/organisms/admin-shell";
import type { requireAdmin as RequireAdmin } from "@/lib/admin/access";
import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import {
  AdminSectionPlaceholder,
  AdminSectionPlaceholderResolver,
  type PlaceholderSection,
} from "./admin-section-placeholder";

const { requireAdmin, shellProps } = vi.hoisted(() => ({
  requireAdmin: vi.fn<typeof RequireAdmin>(),
  shellProps: vi.fn<(props: Omit<AdminShellProps, "children">) => void>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The session check has its own tests; here it answers with the login, or
// sends the visitor to the sign-in page the way the real one does.
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));

// The shell has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/admin-shell", () => ({
  AdminShell: ({ children, ...props }: AdminShellProps) => {
    shellProps(props);
    return <div data-testid="admin-shell">{children}</div>;
  },
}));

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

/** The placeholder of `section` in `locale`, with a session or without. */
function setup({
  locale = "en",
  section = "users",
  signedIn = true,
}: {
  locale?: string;
  section?: PlaceholderSection;
  signedIn?: boolean;
} = {}) {
  requireAdmin.mockImplementation(async (returnTo) => {
    if (!signedIn) {
      redirect(`/admin/sign-in?next=${encodeURIComponent(returnTo)}`);
    }

    return await Promise.resolve({
      email: "ada@example.com",
      name: "Ada Admin",
    });
  });

  const resolve = async () =>
    await AdminSectionPlaceholderResolver({
      params: makeParams(locale),
      section,
    });

  return {
    resolve,
    show: async () => {
      render(await resolve());
    },
  };
}

describe("AdminSectionPlaceholder", () => {
  test("waits for the session behind the shell's skeleton, before any check", () => {
    const params = makeParams("es");
    const boundary = AdminSectionPlaceholder({
      params,
      section: "users",
    }) as ReactElement<{
      children: ReactElement<{ params: unknown; section: string }>;
      fallback: ReactNode;
    }>;

    renderWithI18n(<div>{boundary.props.fallback}</div>, { locale: "es" });

    expect(screen.getByTestId("admin-shell-skeleton")).toHaveTextContent(
      /^Cargando$/u
    );
    expect(boundary.props.children.props).toEqual({
      params,
      section: "users",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
  });
});

describe("AdminSectionPlaceholderResolver", () => {
  test.each([
    ["en", "users", "/en/admin/users"],
    ["es", "users", "/admin/users"],
  ] as const satisfies [Locale, PlaceholderSection, string][])(
    "in %s, checks the session for %s, coming back to %s",
    async (locale, section, returnTo) => {
      const { show } = setup({ locale, section });

      await show();

      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
    }
  );

  test.each([
    ["en", "users", "Users", "Coming soon"],
    ["es", "users", "Usuarios", "Próximamente"],
  ] as const satisfies [Locale, PlaceholderSection, string, string][])(
    "in %s, shows the %s section by name inside the shell, still to come",
    async (locale, section, title, status) => {
      const { show } = setup({ locale, section });

      await show();

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
        login: { email: "ada@example.com", name: "Ada Admin" },
        section,
      });
    }
  );

  test("sends a visitor without a session to the sign-in, with no shell", async () => {
    const { resolve } = setup({
      locale: "es",
      section: "users",
      signedIn: false,
    });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/admin/sign-in?next=%2Fadmin%2Fusers;307;",
    });
    expect(shellProps).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any check", async () => {
    const { resolve } = setup({ locale: "fr" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(shellProps).not.toHaveBeenCalled();
  });
});
