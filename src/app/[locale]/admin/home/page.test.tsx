import { screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { requireAdmin as RequireAdmin } from "@/lib/admin/access";
import type { PublicStore } from "@/server/services/store";
import { renderWithI18n } from "@/test/i18n";

import HomeShortcut from "./page";

interface HomeShortcutParams {
  params: Promise<{ locale: string }>;
}

const { readHomePageId, readStore, requireAdmin } = vi.hoisted(() => ({
  readHomePageId: vi.fn(async (_store: unknown) => 4),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
  requireAdmin: vi.fn<typeof RequireAdmin>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The session check has its own tests; here it answers with the login, or
// sends the visitor to the sign-in page the way the real one does.
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));

// The cached reads have their own tests; here they answer what the test says.
vi.mock("@/server/cache/store", () => ({ readStore }));

vi.mock("@/server/cache/page", () => ({ readHomePageId }));

type Boundary<P> = ReactElement<{
  children: ReactElement<P, (props: P) => Promise<ReactNode>>;
  fallback: ReactNode;
}>;

const STORE: PublicStore = {
  currencyCode: "UYU",
  id: 7,
  instagramUrl: null,
  name: "LR Market",
  tiktokUrl: null,
  translations: [],
  whatsappNumber: null,
};

/** `/admin/home`'s boundary, with a session or without one. */
function setup({
  locale = "en",
  signedIn = true,
  store = STORE,
}: { locale?: string; signedIn?: boolean; store?: PublicStore | null } = {}) {
  requireAdmin.mockImplementation(async (returnTo) => {
    if (!signedIn) {
      redirect(`/admin/sign-in?next=${encodeURIComponent(returnTo)}`);
    }

    return await Promise.resolve({ email: "ada@example.com", name: "Ada" });
  });
  readStore.mockResolvedValue(store);
  const page: Boundary<HomeShortcutParams> = HomeShortcut({
    params: Promise.resolve({ locale }),
  });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    resolve: async () => await inner.type(inner.props),
  };
}

describe("HomeShortcut", () => {
  test("waits behind the shell's skeleton, without reading the params", () => {
    const { fallback } = setup();

    renderWithI18n(<div>{fallback}</div>);

    expect(screen.getByTestId("admin-shell-skeleton")).toBeInTheDocument();
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test.each([
    ["en", "/en/admin/home", "/en/admin/pages/4"],
    ["es", "/admin/home", "/admin/pages/4"],
  ] as const)(
    "in %s, checks the session, then leads to the editor of the page that is the home now",
    async (locale, returnTo, editor) => {
      const { resolve } = setup({ locale });

      await expect(resolve()).rejects.toMatchObject({
        digest: `NEXT_REDIRECT;replace;${editor};307;`,
      });
      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
      expect(readHomePageId).toHaveBeenCalledExactlyOnceWith(STORE);
    }
  );

  test("sends a visitor without a session to the sign-in, telling nothing of the home", async () => {
    const { resolve } = setup({ locale: "es", signedIn: false });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/admin/sign-in?next=%2Fadmin%2Fhome;307;",
    });
    expect(readStore).not.toHaveBeenCalled();
    expect(readHomePageId).not.toHaveBeenCalled();
  });

  test("answers 404 before the store's row exists", async () => {
    const { resolve } = setup({ store: null });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(readHomePageId).not.toHaveBeenCalled();
  });
});
