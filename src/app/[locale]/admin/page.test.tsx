import { screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { requireAdmin as RequireAdmin } from "@/lib/admin/access";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import AdminHome, { AdminLanding } from "./page";

const { requireAdmin } = vi.hoisted(() => ({
  requireAdmin: vi.fn<typeof RequireAdmin>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The session check has its own tests; here it answers with the login, or
// sends the visitor to the sign-in page the way the real one does.
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));

type Boundary = ReactElement<{
  children: ReactElement<{ locale: Locale }>;
  fallback: ReactNode;
}>;

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

/** The landing for `locale`, with a session or without one. */
function setup({
  locale = "en",
  signedIn = true,
}: { locale?: Locale; signedIn?: boolean } = {}) {
  requireAdmin.mockImplementation(async (returnTo) => {
    if (!signedIn) {
      redirect(`/admin/sign-in?next=${encodeURIComponent(returnTo)}`);
    }

    return await Promise.resolve({ name: "Ada Admin" });
  });

  return { land: async () => await AdminLanding({ locale }) };
}

describe("AdminHome", () => {
  test.each([
    ["en", "Loading"],
    ["es", "Cargando"],
  ] as const)(
    "in %s, waits for the session behind the shell's skeleton, before any check",
    async (locale, loading) => {
      const page: Boundary = await AdminHome({ params: makeParams(locale) });

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
    expect(requireAdmin).not.toHaveBeenCalled();
  });
});

describe("AdminLanding", () => {
  test.each([
    ["en", "/en/admin", "/en/admin/orders"],
    ["es", "/admin", "/admin/orders"],
  ] as const)(
    "in %s, checks the session, coming back to %s, then opens the orders at %s",
    async (locale, returnTo, orders) => {
      const { land } = setup({ locale });

      await expect(land()).rejects.toMatchObject({
        digest: `NEXT_REDIRECT;replace;${orders};307;`,
      });
      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
    }
  );

  test("sends a visitor without a session to the sign-in, never to the orders", async () => {
    const { land } = setup({ locale: "es", signedIn: false });

    await expect(land()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/admin/sign-in?next=%2Fadmin;307;",
    });
  });
});
