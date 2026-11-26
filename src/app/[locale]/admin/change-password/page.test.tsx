import { screen, within } from "@testing-library/react";
import type * as Navigation from "next/navigation";
import { redirect } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { requireLogin as RequireLogin } from "@/lib/admin/access";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import ChangePasswordPage, { ChangePasswordCard } from "./page";

interface CardProps {
  locale: Locale;
  searchParams: Promise<{ next?: string | string[] }>;
}

/** The page: the logo, the card's boundary and the language and theme. */
type PageTree = ReactElement<{
  children: [
    ReactElement,
    ReactElement<{
      children: ReactElement<
        CardProps,
        (props: CardProps) => Promise<ReactNode>
      >;
      fallback: ReactNode;
    }>,
    ReactElement,
  ];
}>;

const { requireLogin } = vi.hoisted(() => ({
  requireLogin: vi.fn<typeof RequireLogin>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The session check has its own tests; here it answers with the login, or
// sends the visitor to the sign-in page the way the real one does.
vi.mock("@/lib/admin/access", () => ({ requireLogin }));

// The language link reads the URL, which exists only inside a Next render.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof Navigation>()),
  usePathname: () => "/admin/change-password",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// The form and the sign-out button have their own tests; here they show
// what the page handed them.
vi.mock("@/app/_components/organisms/change-password-form", () => ({
  ChangePasswordForm: ({
    forced,
    redirectTo,
  }: {
    forced: boolean;
    redirectTo: string;
  }) => (
    <div
      data-forced={forced}
      data-redirect-to={redirectTo}
      data-testid="change-password-form"
    />
  ),
}));

vi.mock("@/app/_components/molecules/sign-out-button", () => ({
  SignOutButton: ({ redirectTo }: { redirectTo: string }) => (
    <div data-redirect-to={redirectTo} data-testid="sign-out-button" />
  ),
}));

async function makeSearchParams(next?: string | string[]) {
  return await Promise.resolve(next === undefined ? {} : { next });
}

/** The page's tree in `locale`, its logo, fallback and controls rendered. */
async function setupPage({ locale = "en" }: { locale?: string } = {}) {
  const page: PageTree = await ChangePasswordPage({
    params: Promise.resolve({ locale }),
    searchParams: makeSearchParams(),
  });
  const [logo, boundary, controls] = page.props.children;
  renderWithI18n(
    <>
      {logo}
      {boundary.props.fallback}
      {controls}
    </>,
    { locale: locale === "es" ? "es" : "en" }
  );

  return { boundary, page };
}

/**
 * The card, as it streams once the query string and the login are read: a
 * login on a temporary password when `forced`, signed out when not
 * `signedIn`.
 */
function setupCard({
  forced = false,
  locale = "en",
  next,
  signedIn = true,
}: {
  forced?: boolean;
  locale?: Locale;
  next?: string | string[];
  signedIn?: boolean;
} = {}) {
  requireLogin.mockImplementation(async (returnTo) => {
    if (!signedIn) {
      redirect(`/admin/sign-in?next=${encodeURIComponent(returnTo)}`);
    }

    return await Promise.resolve({
      email: "ada@example.com",
      mustChangePassword: forced,
      name: "Ada Admin",
    });
  });
  const props = { locale, searchParams: makeSearchParams(next) };

  return {
    resolve: async () => await ChangePasswordCard(props),
    show: async () => {
      renderWithI18n(<div>{await ChangePasswordCard(props)}</div>, { locale });
    },
  };
}

describe("ChangePasswordPage", () => {
  test.each([
    ["en", "Loading"],
    ["es", "Cargando"],
  ])(
    "in %s, shows the full logo and waits for the card behind its skeleton, reading no session",
    async (locale, loading) => {
      const { boundary, page } = await setupPage({ locale });

      expect(page.type).toBe("main");
      expect(page.props).toMatchObject({
        "data-testid": "admin-change-password",
      });
      expect(screen.getByRole("img", { name: "LR Market" })).toHaveAttribute(
        "data-variant",
        "full"
      );
      const skeleton = screen.getByTestId("change-password-skeleton");
      expect(skeleton).toHaveAttribute("aria-busy", "true");
      expect(skeleton).toHaveTextContent(loading);
      expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
      expect(boundary.props.children.type).toBe(ChangePasswordCard);
      expect(boundary.props.children.props.locale).toBe(locale);
      expect(requireLogin).not.toHaveBeenCalled();
    }
  );

  test("answers 404 for a language the product does not speak", async () => {
    await expect(setupPage({ locale: "fr" })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});

describe("ChangePasswordCard", () => {
  test.each([
    ["en", undefined, "/en/admin/change-password"],
    [
      "es",
      "/admin/orders?tab=packed",
      "/admin/change-password?next=%2Fadmin%2Forders%3Ftab%3Dpacked",
    ],
    // Two `next` in the query string: neither is carried back.
    ["en", ["/en/admin/orders", "/en/admin"], "/en/admin/change-password"],
  ] satisfies [Locale, string | string[] | undefined, string][])(
    "in %s, with ?next=%j, checks the session coming back to %s",
    async (locale, next, here) => {
      const { show } = setupCard({ locale, next });

      await show();

      expect(requireLogin).toHaveBeenCalledExactlyOnceWith(here, locale);
    }
  );

  test("sends a visitor without a session to the sign-in, coming back here", async () => {
    const { resolve } = setupCard({
      locale: "es",
      next: "/admin/users",
      signedIn: false,
    });

    await expect(resolve()).rejects.toMatchObject({
      digest: `NEXT_REDIRECT;replace;/admin/sign-in?next=${encodeURIComponent(
        "/admin/change-password?next=%2Fadmin%2Fusers"
      )};307;`,
    });
  });

  test.each([
    [
      "en",
      "You signed in with a temporary password. Choose your own to continue.",
      "Change your password",
    ],
    [
      "es",
      "Entraste con una contraseña temporal. Elegí la tuya para seguir.",
      "Cambiá tu contraseña",
    ],
  ] as const)(
    "in %s, a login on a temporary password is asked for its own, and can only sign out",
    async (locale, subtitle, title) => {
      const { show } = setupCard({
        forced: true,
        locale,
        next: "/en/admin/users",
      });

      await show();

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        new RegExp(`^${title}$`, "u")
      );
      expect(screen.getByText(subtitle)).toBeInTheDocument();
      const form = screen.getByTestId("change-password-form");
      expect(form).toHaveAttribute("data-forced", "true");
      expect(form).toHaveAttribute(
        "data-redirect-to",
        locale === "en" ? "/en/admin/users" : "/admin/users"
      );
      expect(screen.getByTestId("sign-out-button")).toHaveAttribute(
        "data-redirect-to",
        "/admin/sign-in"
      );
      expect(screen.queryByTestId("change-password-back")).toBeNull();
    }
  );

  test("a login that chose its own password may go back where it came from, and says who it is", async () => {
    const { show } = setupCard({ next: "/en/admin/products" });

    await show();

    expect(
      screen.getByText(
        "Choose a new password. Sessions on other devices are signed out."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Signed in as ada@example.com")
    ).toBeInTheDocument();
    expect(screen.getByTestId("change-password-form")).toHaveAttribute(
      "data-forced",
      "false"
    );
    expect(screen.getByTestId("change-password-back")).toHaveAttribute(
      "href",
      "/en/admin/products"
    );
    expect(
      within(screen.getByTestId("change-password-back")).getByText(
        "Back to the dashboard"
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId("sign-out-button")).toBeNull();
  });

  test.each([
    ["//evil.example", "/en/admin"],
    ["/en/admin/change-password", "/en/admin"],
    [undefined, "/en/admin"],
  ])(
    "with ?next=%j, lands and goes back to %s, never off the admin or onto itself",
    async (next, to) => {
      const { show } = setupCard({ next });

      await show();

      expect(screen.getByTestId("change-password-form")).toHaveAttribute(
        "data-redirect-to",
        to
      );
      expect(screen.getByTestId("change-password-back")).toHaveAttribute(
        "href",
        to
      );
    }
  );
});
