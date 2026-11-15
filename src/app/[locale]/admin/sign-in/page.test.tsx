import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";

import SignInPage from "./page";

interface SignInFormProps {
  locale: Locale;
  searchParams: Promise<{ next?: string | string[] }>;
}

type SignInTree = ReactElement<{
  children: [
    ReactElement,
    ReactElement<{
      children: ReactElement<
        SignInFormProps,
        (props: SignInFormProps) => Promise<ReactNode>
      >;
      fallback: ReactNode;
    }>,
  ];
}>;

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{ user: { id: string } } | null>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("@/server/better-auth/server", () => ({ getSession }));

// The form has its own tests; here it only shows where it will land.
vi.mock("@/app/_components/organisms/auth-form", () => ({
  AuthForm: ({ redirectTo }: { redirectTo?: string }) => (
    <div data-redirect-to={redirectTo} data-testid="auth-form" />
  ),
}));

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

async function makeSearchParams(next?: string | string[]) {
  return await Promise.resolve(next === undefined ? {} : { next });
}

/**
 * The page with its heading and fallback rendered, and what its boundary
 * streams once the query string and the session are read. Signed out unless
 * `signedIn`.
 */
async function setup({
  locale = "en",
  next,
  signedIn = false,
}: { locale?: string; next?: string | string[]; signedIn?: boolean } = {}) {
  getSession.mockResolvedValue(signedIn ? { user: { id: "user-1" } } : null);
  const page: SignInTree = await SignInPage({
    params: makeParams(locale),
    searchParams: makeSearchParams(next),
  });
  const [heading, boundary] = page.props.children;
  const form = boundary.props.children;

  render(
    <>
      {heading}
      {boundary.props.fallback}
    </>
  );

  return {
    page,
    resolve: async () => await form.type(form.props),
    showForm: async () => {
      render(await form.type(form.props));
      return screen.getByTestId("auth-form");
    },
  };
}

describe("SignInPage", () => {
  test.each([
    [
      "en",
      "Your store's admin",
      "Sign in with the email and password you were given.",
      "Loading",
    ],
    [
      "es",
      "Panel de tu tienda",
      "Iniciá sesión con el email y la contraseña que te dieron.",
      "Cargando",
    ],
  ])(
    "in %s, titles the page and waits for the form behind a busy box",
    async (locale, title, subtitle, loading) => {
      const { page } = await setup({ locale });

      expect(page.props).toMatchObject({ "data-testid": "admin-sign-in" });
      expect(page.type).toBe("main");
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        new RegExp(`^${title}$`, "u")
      );
      expect(screen.getByText(subtitle)).toBeInTheDocument();
      expect(screen.getByTitle(loading)).toHaveAttribute("aria-busy", "true");
    }
  );

  test.each([
    ["en", "/en/admin/lr-market/orders", "/en/admin/lr-market/orders"],
    ["es", "/admin/platform/users?tab=all", "/admin/platform/users?tab=all"],
    // A link in the other language lands in the page's.
    ["es", "/en/admin/lr-market/orders", "/admin/lr-market/orders"],
    ["en", "//evil.example", "/en/admin"],
    ["es", "https://evil.example/admin", "/admin"],
    ["en", "/en/admin/sign-in", "/en/admin"],
    ["es", "/lr-market", "/admin"],
    ["en", undefined, "/en/admin"],
    // Two `next` in the query string: neither is trusted.
    ["en", ["/en/admin/lr-market/orders"], "/en/admin"],
  ] satisfies [Locale, string | string[] | undefined, string][])(
    "in %s, signed out, with ?next=%j, lands the form at %s",
    async (locale, next, redirectTo) => {
      const { showForm } = await setup({ locale, next });

      expect(await showForm()).toHaveAttribute("data-redirect-to", redirectTo);
      expect(getSession).toHaveBeenCalledExactlyOnceWith();
    }
  );

  test.each([
    ["en", "/en/admin/lr-market/orders", "/en/admin/lr-market/orders"],
    ["es", "/admin/platform/users", "/admin/platform/users"],
    ["en", "//evil.example", "/en/admin"],
  ] satisfies [Locale, string, string][])(
    "in %s, sends a login already signed in straight on: ?next=%j goes to %s, with no form",
    async (locale, next, to) => {
      const { resolve } = await setup({ locale, next, signedIn: true });

      await expect(resolve()).rejects.toMatchObject({
        digest: `NEXT_REDIRECT;replace;${to};307;`,
      });
      expect(screen.queryByTestId("auth-form")).not.toBeInTheDocument();
    }
  );

  test("answers 404 for a language the product does not speak", async () => {
    await expect(setup({ locale: "fr" })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});
