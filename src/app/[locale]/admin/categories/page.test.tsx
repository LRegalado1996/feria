import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
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
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import CategoriesPage from "./page";

type AdminStore = ReturnType<typeof RequireAdminStore>;

interface CategoriesParams {
  params: Promise<{ locale: string; store: string }>;
}

const LIST_KEY = ["category", "list"] as const;

const {
  list,
  queryOptions,
  requireAdmin,
  requireAdminStore,
  requireStoreSegment,
  shellProps,
} = vi.hoisted(() => {
  const listMock = vi.fn(async (_input: unknown): Promise<unknown> => []);

  return {
    list: listMock,
    queryOptions: vi.fn(({ input }: { input: unknown }) => ({
      queryFn: async () => await listMock(input),
      queryKey: ["category", "list", { input }],
    })),
    requireAdmin: vi.fn<typeof RequireAdmin>(),
    requireAdminStore: vi.fn<typeof RequireAdminStore>(),
    requireStoreSegment: vi.fn<typeof RequireStoreSegment>(),
    shellProps: vi.fn<(props: Omit<AdminShellProps, "children">) => void>(),
  };
});

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The checks have their own tests; here they answer with the login and the
// store, and are spied on for what the page asked.
vi.mock("@/lib/admin/access", () => ({
  requireAdmin,
  requireAdminStore,
  requireStoreSegment,
}));

vi.mock("@/lib/orpc/server", async () => {
  const { QueryClient: Client } = await import("@tanstack/react-query");
  return {
    getQueryClient: () => new Client(),
    orpc: { category: { list: { queryOptions } } },
  };
});

// The shell has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/admin-shell", () => ({
  AdminShell: ({ children, ...props }: AdminShellProps) => {
    shellProps(props);
    return <div data-testid="admin-shell">{children}</div>;
  },
}));

// The manager has its own tests; here it shows the store it was given and
// the list it found in the cache the page hydrated.
vi.mock("@/app/_components/organisms/category-manager", () => ({
  CategoryManager: ({ storeSlug }: { storeSlug: string }) => {
    const cached = useQueryClient().getQueryData([
      ...LIST_KEY,
      { input: { storeSlug } },
    ]);
    return (
      <div data-testid="category-manager">{`${storeSlug} ${JSON.stringify(cached ?? null)}`}</div>
    );
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
    stores: [makeStore()],
  };
}

async function makeParams(locale: string, store: string) {
  return await Promise.resolve({ locale, store });
}

/**
 * The page's boundary for `/admin/<store>/categories`: its fallback, and what
 * it streams once resolved. The segment check passes any segment but
 * "Bad Segment"; the store check answers 404 for any store but the login's.
 */
function setup({
  locale = "en",
  prefetchFails = false,
  store = "lr-market",
}: { locale?: string; prefetchFails?: boolean; store?: string } = {}) {
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
  list.mockImplementation(async () => {
    if (prefetchFails) {
      throw new Error("database unavailable");
    }

    return await Promise.resolve([{ id: 4, nameEs: "Collares" }]);
  });
  const page: Boundary<CategoriesParams> = CategoriesPage({
    params: makeParams(locale, store),
  });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    found,
    me,
    resolve: async () => await inner.type(inner.props),
    show: async () => {
      render(await inner.type(inner.props), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={new QueryClient()}>
            {children}
          </QueryClientProvider>
        ),
      });
    },
  };
}

describe("CategoriesPage", () => {
  test("waits behind the shell's skeleton, without reading the params", () => {
    const { fallback } = setup();

    renderWithI18n(<div>{fallback}</div>);

    expect(screen.getByTestId("admin-shell-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test("answers 404 for a segment that is not a store address, before any session check", async () => {
    const { resolve } = setup({ store: "Bad Segment" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireStoreSegment).toHaveBeenCalledExactlyOnceWith("Bad Segment");
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any check", async () => {
    const { resolve } = setup({ locale: "fr" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireStoreSegment).not.toHaveBeenCalled();
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test.each([
    ["en", "/en/admin/lr-market/categories"],
    ["es", "/admin/lr-market/categories"],
  ] as const)(
    "in %s, checks the session coming back to this page, then the store among the login's",
    async (locale, returnTo) => {
      const { me, show } = setup({ locale });

      await show();

      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
      expect(requireAdminStore).toHaveBeenCalledExactlyOnceWith(
        me,
        "lr-market"
      );
      const [sessionAt = 0, storeAt = 0] = [
        requireAdmin,
        requireAdminStore,
      ].map((check) => check.mock.invocationCallOrder[0]);
      expect(sessionAt).toBeLessThan(storeAt);
    }
  );

  test("answers 404 for a store the login may not work on, fetching nothing", async () => {
    const { me, resolve } = setup({ store: "sample-store" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireAdminStore).toHaveBeenCalledExactlyOnceWith(
      me,
      "sample-store"
    );
    expect(list).not.toHaveBeenCalled();
    expect(shellProps).not.toHaveBeenCalled();
  });

  test.each(["en", "es"] as const)(
    "in %s, opens the categories section in the shell with the store's list already fetched",
    async (locale) => {
      const { found, me, show } = setup({ locale });

      await show();

      expect(shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        location: { kind: "store", section: "categories", store: found },
        role: "member",
        stores: me.stores,
      });
      expect(list).toHaveBeenCalledExactlyOnceWith({ storeSlug: "lr-market" });
      expect(
        within(screen.getByTestId("admin-shell")).getByTestId(
          "category-manager"
        )
      ).toHaveTextContent('lr-market [{"id":4,"nameEs":"Collares"}]');
    }
  );

  test("still opens the screen when the prefetch fails, leaving the fetch to it", async () => {
    const { show } = setup({ prefetchFails: true });

    await show();

    expect(list).toHaveBeenCalledExactlyOnceWith({ storeSlug: "lr-market" });
    expect(screen.getByTestId("category-manager")).toHaveTextContent(
      /^lr-market null$/u
    );
  });
});
