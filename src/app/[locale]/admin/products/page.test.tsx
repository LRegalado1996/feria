import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { redirect } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { AdminShellProps } from "@/app/_components/organisms/admin-shell";
import type { ProductListProps } from "@/app/_components/organisms/product-list";
import type { requireAdmin as RequireAdmin } from "@/lib/admin/access";
import { EMPTY_PRODUCTS_QUERY } from "@/lib/admin/products";
import type { RawSearchParams } from "@/lib/catalog/query";
import { holdRequest, settle } from "@/test/connection";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import ProductsPage from "./page";

interface ProductsPageParams {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}

const RENDERED_AT = Date.parse("2026-11-18T12:00:00.000Z");

const PAGE = {
  currencyCode: "UYU",
  items: [{ id: 9, title: "Anillo" }],
  limit: 24,
  page: 1,
  pageCount: 1,
  total: 1,
  totalCapped: false,
};
const CATEGORIES = [{ id: 3, slug: "anillos" }];
const ATTRIBUTES = [{ id: 5, slug: "color", values: [] }];

const {
  attributes,
  categories,
  connection,
  list,
  listProps,
  requireAdmin,
  shellProps,
} = vi.hoisted(() => ({
  attributes: vi.fn(async (): Promise<unknown> => null),
  categories: vi.fn(async (): Promise<unknown> => null),
  connection: vi.fn(async () => {
    await Promise.resolve();
  }),
  list: vi.fn(async (_input: unknown): Promise<unknown> => null),
  listProps: vi.fn<(props: ProductListProps) => void>(),
  requireAdmin: vi.fn<typeof RequireAdmin>(),
  shellProps: vi.fn<(props: Omit<AdminShellProps, "children">) => void>(),
}));

// The clock is read after `connection()`, which needs a request.
vi.mock("next/server", () => ({ connection }));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The session check has its own tests; here it answers with the login, or
// sends the visitor to the sign-in page the way the real one does.
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));

vi.mock("@/lib/orpc/server", async () => {
  const { QueryClient: Client } = await import("@tanstack/react-query");
  return {
    getQueryClient: () => new Client(),
    orpc: {
      attribute: {
        list: {
          queryOptions: () => ({
            queryFn: async () => await attributes(),
            queryKey: ["attribute", "list"],
          }),
        },
      },
      category: {
        list: {
          queryOptions: () => ({
            queryFn: async () => await categories(),
            queryKey: ["category", "list"],
          }),
        },
      },
      product: {
        list: {
          queryOptions: ({ input }: { input: unknown }) => ({
            queryFn: async () => await list(input),
            queryKey: ["product", "list", { input }],
          }),
        },
      },
    },
  };
});

// The shell has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/admin-shell", () => ({
  AdminShell: ({ children, ...props }: AdminShellProps) => {
    shellProps(props);
    return <div data-testid="admin-shell">{children}</div>;
  },
}));

// The list has its own tests; here it records its props and shows what it
// finds in the cache the page hydrated.
vi.mock("@/app/_components/organisms/product-list", () => ({
  ProductList: (props: ProductListProps) => {
    listProps(props);
    const client = useQueryClient();
    const cached = {
      attributes: client.getQueryData(["attribute", "list"]) ?? null,
      categories: client.getQueryData(["category", "list"]) ?? null,
      products: client
        .getQueryCache()
        .findAll({ queryKey: ["product", "list"] })
        .map((query) => [query.queryKey, query.state.data ?? null]),
    };
    return <div data-testid="product-list">{JSON.stringify(cached)}</div>;
  },
}));

type Boundary<P> = ReactElement<{
  children: ReactElement<P, (props: P) => Promise<ReactNode>>;
  fallback: ReactNode;
}>;

/**
 * The page's boundary for `/admin/products`: its fallback, and what it
 * streams once resolved, with a session or without one.
 */
function setup({
  locale = "en",
  prefetchFails = false,
  searchParams = {},
  signedIn = true,
}: {
  locale?: string;
  prefetchFails?: boolean;
  searchParams?: RawSearchParams;
  signedIn?: boolean;
} = {}) {
  vi.setSystemTime(RENDERED_AT);
  requireAdmin.mockImplementation(async (returnTo) => {
    if (!signedIn) {
      redirect(`/admin/sign-in?next=${encodeURIComponent(returnTo)}`);
    }

    return await Promise.resolve({
      email: "ada@example.com",
      name: "Ada Admin",
    });
  });
  const answer = async (value: unknown) => {
    if (prefetchFails) {
      throw new Error("database unavailable");
    }

    return await Promise.resolve(value);
  };
  list.mockImplementation(async () => await answer(PAGE));
  categories.mockImplementation(async () => await answer(CATEGORIES));
  attributes.mockImplementation(async () => await answer(ATTRIBUTES));
  const page: Boundary<ProductsPageParams> = ProductsPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(searchParams),
  });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    /** What the list found in the hydrated cache. */
    hydrated: () =>
      JSON.parse(
        within(screen.getByTestId("admin-shell")).getByTestId("product-list")
          .textContent
      ) as unknown,
    resolve: async () => await inner.type(inner.props),
    /** Renders what the boundary streams, once `resolving` (a fresh one) does. */
    show: async (resolving = inner.type(inner.props)) => {
      render(await resolving, {
        wrapper: ({ children }) => (
          <QueryClientProvider client={new QueryClient()}>
            {children}
          </QueryClientProvider>
        ),
      });
    },
  };
}

describe("ProductsPage", () => {
  test("waits behind the shell's skeleton, without reading the params", () => {
    const { fallback } = setup();

    renderWithI18n(<div>{fallback}</div>);

    expect(screen.getByTestId("admin-shell-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any check", async () => {
    const { resolve } = setup({ locale: "fr" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  test.each([
    ["en", {}, "/en/admin/products"],
    ["es", {}, "/admin/products"],
    [
      "es",
      { category: "anillos", page: "2", q: "aro", sort: "price" },
      "/admin/products?q=aro&category=anillos&sort=price&page=2",
    ],
  ] as const)(
    "in %s with %j, checks the session coming back to this selection, before fetching anything",
    async (locale, searchParams, returnTo) => {
      const { show } = setup({ locale, searchParams });

      await show();

      expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(returnTo, locale);
      const sessionAt = requireAdmin.mock.invocationCallOrder[0] ?? 0;
      expect(sessionAt).toBeLessThan(list.mock.invocationCallOrder[0] ?? 0);
      expect(sessionAt).toBeLessThan(
        categories.mock.invocationCallOrder[0] ?? 0
      );
      expect(sessionAt).toBeLessThan(
        attributes.mock.invocationCallOrder[0] ?? 0
      );
    }
  );

  test("sends a visitor without a session to the sign-in, fetching nothing", async () => {
    const { resolve } = setup({
      locale: "es",
      searchParams: { status: "draft" },
      signedIn: false,
    });

    await expect(resolve()).rejects.toMatchObject({
      digest:
        "NEXT_REDIRECT;replace;/admin/sign-in?next=%2Fadmin%2Fproducts%3Fstatus%3Ddraft;307;",
    });
    expect(list).not.toHaveBeenCalled();
    expect(categories).not.toHaveBeenCalled();
    expect(attributes).not.toHaveBeenCalled();
    expect(shellProps).not.toHaveBeenCalled();
  });

  test.each(["en", "es"] as const)(
    "in %s, opens the articles section with the page, the categories and the filters already fetched",
    async (locale) => {
      const { hydrated, show } = setup({ locale });

      await show();

      expect(shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        login: { email: "ada@example.com", name: "Ada Admin" },
        section: "products",
      });
      expect(connection).toHaveBeenCalledExactlyOnceWith();
      expect(listProps).toHaveBeenCalledExactlyOnceWith({
        query: EMPTY_PRODUCTS_QUERY,
        renderedAt: RENDERED_AT,
      });
      // The input `productsListInput` builds, as the screen asks for it.
      expect(list).toHaveBeenCalledExactlyOnceWith({ locale });
      expect(hydrated()).toEqual({
        attributes: ATTRIBUTES,
        categories: CATEGORIES,
        products: [[["product", "list", { input: { locale } }], PAGE]],
      });
    }
  );

  test("reads the clock the ages start from only once the request is there", async () => {
    const { resolve, show } = setup();
    const request = holdRequest(connection);

    const resolving = resolve();
    await settle();
    // The request arrives a moment later: the clock is the one it brings.
    vi.setSystemTime(RENDERED_AT + 5000);

    expect(connection).toHaveBeenCalledExactlyOnceWith();

    request.arrive();
    await show(resolving);

    expect(listProps).toHaveBeenCalledExactlyOnceWith({
      query: EMPTY_PRODUCTS_QUERY,
      renderedAt: RENDERED_AT + 5000,
    });
  });

  test("reads the selection from the address, dropping what is malformed, and fetches that page", async () => {
    const { show } = setup({
      searchParams: {
        availability: "maybe",
        category: "anillos,Not A Slug",
        dir: "desc",
        "f.color": "dorado,violeta",
        page: "3",
        q: "  aro  ",
        sort: "price",
        status: "draft",
      },
    });

    await show();

    const query = {
      availability: null,
      categories: ["anillos"],
      dir: "desc",
      filters: [{ attribute: "color", values: ["dorado", "violeta"] }],
      page: 3,
      q: "aro",
      sort: "price",
      status: "draft",
    };
    expect(listProps).toHaveBeenCalledExactlyOnceWith({
      query,
      renderedAt: RENDERED_AT,
    });
    expect(list).toHaveBeenCalledExactlyOnceWith({
      categories: ["anillos"],
      dir: "desc",
      filters: [{ attribute: "color", values: ["dorado", "violeta"] }],
      locale: "en",
      page: 3,
      q: "aro",
      sort: "price",
      status: "draft",
    });
  });

  test("still opens the screen when the prefetches fail, leaving the reads to it", async () => {
    const { hydrated, show } = setup({ prefetchFails: true });

    await show();

    expect(list).toHaveBeenCalledExactlyOnceWith({ locale: "en" });
    // A failed read is not handed over: the screen reads again.
    expect(hydrated()).toEqual({
      attributes: null,
      categories: null,
      products: [],
    });
  });
});
