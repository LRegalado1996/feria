import { render, screen, within } from "@testing-library/react";
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { AdminShellProps } from "@/app/_components/organisms/admin-shell";
import type {
  AdminProfile,
  requireAdmin as RequireAdmin,
  requireAdminStore as RequireAdminStore,
  requireStoreSegment as RequireStoreSegment,
} from "@/lib/admin/access";
import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import StoreSection from "./page";

type AdminStore = ReturnType<typeof RequireAdminStore>;

interface StoreSectionParams {
  params: Promise<{ locale: string; section: string; store: string }>;
}

const { requireAdmin, requireAdminStore, requireStoreSegment, shellProps } =
  vi.hoisted(() => ({
    requireAdmin: vi.fn<typeof RequireAdmin>(),
    requireAdminStore: vi.fn<typeof RequireAdminStore>(),
    requireStoreSegment: vi.fn<typeof RequireStoreSegment>(),
    shellProps: vi.fn<(props: Omit<AdminShellProps, "children">) => void>(),
  }));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The checks have their own tests; here they answer with the login and the
// store, and are spied on for what the page asked.
vi.mock("@/lib/admin/access", () => ({
  requireAdmin,
  requireAdminStore,
  requireStoreSegment,
}));

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

function makeStore(): AdminStore {
  return { id: 1, isActive: true, name: "LR Market", slug: "lr-market" };
}

function makeMe(): AdminProfile {
  return {
    name: "Ada Admin",
    role: "member",
    stores: [{ id: 1, isActive: true, name: "LR Market", slug: "lr-market" }],
  };
}

async function makeParams(locale: string, section: string, store: string) {
  return await Promise.resolve({ locale, section, store });
}

/**
 * The page's boundary for `/admin/<store>/<section>`: its fallback, and what
 * it streams once resolved. The segment check passes any segment but
 * "Bad Segment"; the store check answers 404 for any store but the login's
 * own.
 */
function setup({
  locale = "en",
  section = "orders",
  store = "lr-market",
}: { locale?: string; section?: string; store?: string } = {}) {
  const me = makeMe();
  const found = makeStore();
  requireAdmin.mockResolvedValue(me);
  requireStoreSegment.mockImplementation((segment) => {
    if (segment === "Bad Segment") {
      notFound();
    }

    return segment;
  });
  requireAdminStore.mockImplementation((_profile, slug) => {
    if (slug !== found.slug) {
      notFound();
    }

    return found;
  });
  const page: Boundary<StoreSectionParams> = StoreSection({
    params: makeParams(locale, section, store),
  });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    found,
    me,
    resolve: async () => await inner.type(inner.props),
    show: async () => {
      render(await inner.type(inner.props));
    },
  };
}

describe("StoreSection", () => {
  test("waits behind the shell's skeleton, without reading the params", () => {
    const { fallback } = setup();

    renderWithI18n(<div>{fallback}</div>);

    expect(screen.getByTestId("admin-shell-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test.each(["catalog", "Products", "platform"])(
    "answers 404 for %j, not a store section, before any session check",
    async (section) => {
      const { resolve } = setup({ section });

      await expect(resolve()).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
      expect(requireStoreSegment).not.toHaveBeenCalled();
      expect(requireAdmin).not.toHaveBeenCalled();
      expect(requireAdminStore).not.toHaveBeenCalled();
    }
  );

  test("answers 404 for a segment that is not a store address, before any session check", async () => {
    const { resolve } = setup({ store: "Bad Segment" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireStoreSegment).toHaveBeenCalledExactlyOnceWith("Bad Segment");
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any check", async () => {
    const { resolve } = setup({ locale: "fr" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test.each([
    ["en", "/en/admin/lr-market/orders"],
    ["es", "/admin/lr-market/orders"],
  ] as const)(
    "in %s, checks the segment, the session coming back to this page, then the store among the login's",
    async (locale, returnTo) => {
      const { me, show } = setup({ locale });

      await show();

      expect(requireStoreSegment).toHaveBeenCalledExactlyOnceWith("lr-market");
      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
      expect(requireAdminStore).toHaveBeenCalledExactlyOnceWith(
        me,
        "lr-market"
      );
      const [segmentAt = 0, sessionAt = 0, storeAt = 0] = [
        requireStoreSegment,
        requireAdmin,
        requireAdminStore,
      ].map((check) => check.mock.invocationCallOrder[0]);
      expect(segmentAt).toBeLessThan(sessionAt);
      expect(sessionAt).toBeLessThan(storeAt);
    }
  );

  test("answers 404 for a store the login may not work on, with no shell", async () => {
    const { me, resolve } = setup({ store: "sample-store" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireAdminStore).toHaveBeenCalledExactlyOnceWith(
      me,
      "sample-store"
    );
    expect(shellProps).not.toHaveBeenCalled();
  });

  test.each([
    ["en", "products", "Articles", "Coming soon"],
    ["en", "users", "Users", "Coming soon"],
    ["es", "orders", "Pedidos", "Próximamente"],
    ["es", "settings", "Ajustes", "Próximamente"],
  ] as const satisfies [Locale, string, string, string][])(
    "in %s, shows the %s section by name inside the shell, still to come",
    async (locale, section, title, status) => {
      const { found, me, show } = setup({ locale, section });

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
        location: { kind: "store", section, store: found },
        role: "member",
        stores: me.stores,
      });
    }
  );
});
