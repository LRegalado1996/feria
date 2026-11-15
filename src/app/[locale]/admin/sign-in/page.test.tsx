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

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

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
 * The page with its heading rendered, and the form its boundary streams once
 * the query string is read.
 */
async function setup({
  locale = "en",
  next,
}: { locale?: string; next?: string | string[] } = {}) {
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
      {await form.type(form.props)}
    </>
  );

  return { form: screen.getByTestId("auth-form"), page };
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
    ["en", "//evil.example", "/en/admin"],
    ["es", "https://evil.example/admin", "/admin"],
    ["en", "/en/admin/sign-in", "/en/admin"],
    ["es", "/lr-market", "/admin"],
    ["en", undefined, "/en/admin"],
    // Two `next` in the query string: neither is trusted.
    ["en", ["/en/admin/lr-market/orders"], "/en/admin"],
  ] satisfies [Locale, string | string[] | undefined, string][])(
    "in %s, with ?next=%j, lands the form at %s",
    async (locale, next, redirectTo) => {
      const { form } = await setup({ locale, next });

      expect(form).toHaveAttribute("data-redirect-to", redirectTo);
    }
  );

  test("answers 404 for a language the product does not speak", async () => {
    await expect(setup({ locale: "fr" })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});
