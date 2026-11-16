import { screen, within } from "@testing-library/react";
import type * as Navigation from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { isLocale, type Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import SignInPage from "./page";

interface SignInFormProps {
  locale: Locale;
  searchParams: Promise<{ next?: string | string[] }>;
}

/**
 * The page: the logo, the card (its heading, then the form's boundary) and
 * the language and theme controls.
 */
type SignInTree = ReactElement<{
  children: [
    ReactElement,
    ReactElement<{
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
      className: string;
    }>,
    ReactElement,
  ];
}>;

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{ user: { id: string } } | null>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("@/server/better-auth/server", () => ({ getSession }));

// The language link reads the URL, which exists only inside a Next render.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof Navigation>()),
  usePathname: () => "/admin/sign-in",
  useSearchParams: () => new URLSearchParams(),
}));

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
 * The page with its logo, heading, fallback and controls rendered, and what
 * its boundary streams once the query string and the session are read.
 * Signed out unless `signedIn`.
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
  const [logo, card, controls] = page.props.children;
  const [heading, boundary] = card.props.children;
  const form = boundary.props.children;
  const language = isLocale(locale) ? locale : "en";

  renderWithI18n(
    <>
      {logo}
      <div data-testid="card">
        {heading}
        {boundary.props.fallback}
      </div>
      {controls}
    </>,
    { locale: language }
  );

  return {
    card: { className: card.props.className },
    page,
    resolve: async () => await form.type(form.props),
    showForm: async () => {
      renderWithI18n(<div>{await form.type(form.props)}</div>, {
        locale: language,
      });
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
    "in %s, titles the page in a card under the full logo and waits for the form behind its skeleton",
    async (locale, title, subtitle, loading) => {
      const { card, page } = await setup({ locale });

      expect(page.props).toMatchObject({ "data-testid": "admin-sign-in" });
      expect(page.type).toBe("main");
      // The full logo, LR on the tag with MARKET under it, above the card.
      expect(screen.getByRole("img", { name: "LR Market" })).toHaveAttribute(
        "data-variant",
        "full"
      );
      // A white card with a hairline border, on the grey canvas.
      expect(card.className.split(" ")).toEqual(
        expect.arrayContaining(["rounded-lg", "border", "bg-card"])
      );
      const content = screen.getByTestId("card");
      expect(
        within(content).getByRole("heading", { level: 1 })
      ).toHaveTextContent(new RegExp(`^${title}$`, "u"));
      expect(within(content).getByText(subtitle)).toBeInTheDocument();
      const skeleton = screen.getByTestId("sign-in-skeleton");
      expect(skeleton).toHaveAttribute("aria-busy", "true");
      expect(skeleton).toHaveTextContent(loading);
      // Two fields (a label and an input each) and the button, in the
      // form's own geometry: 44 px tall on a phone, compact from md up.
      expect(
        [...skeleton.querySelectorAll('[data-slot="skeleton"]')].map((block) =>
          ["h-4", "h-11", "md:h-9", "w-20", "w-full"]
            .filter((size) => block.classList.contains(size))
            .join(" ")
        )
      ).toEqual([
        "h-4 w-20",
        "h-11 md:h-9 w-full",
        "h-4 w-20",
        "h-11 md:h-9 w-full",
        "h-11 md:h-9 w-full",
      ]);
    }
  );

  test.each([
    ["en", "Español", "/admin/sign-in"],
    ["es", "English", "/en/admin/sign-in"],
  ] as const)(
    "in %s, offers the other language and the theme before signing in",
    async (locale, language, href) => {
      await setup({ locale });

      expect(screen.getByRole("link", { name: language })).toHaveAttribute(
        "href",
        href
      );
      expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
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
