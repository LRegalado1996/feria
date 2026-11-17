import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { type CatalogQuery, EMPTY_CATALOG_QUERY } from "@/lib/catalog/query";
import { createQueryClient } from "@/lib/orpc/query-client";
import { stubIntersectionObserver } from "@/test/intersection-observer";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";

import { type CatalogPage, useCatalogProducts } from "./use-catalog-products";

// The app's client reports a failed query; that has its own tests.
vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

function makeItem(id: number): CatalogPage["items"][number] {
  return {
    categorySlug: null,
    cover: null,
    currencyCode: "UYU",
    id,
    isAvailable: true,
    lang: "es",
    priceAmount: id * 100,
    slug: `articulo-${id}`,
    title: `Artículo ${id}`,
  };
}

// The default selection is by price, so its cursor carries the price.
const CURSOR = { id: 2, priceAmount: 2000, sort: "price_asc" as const };
// The store's own order, the empty selection's, carries the place.
const POSITION_CURSOR = { id: 2, position: 2, sort: "position" as const };

function makePage(
  ids: number[],
  nextCursor: CatalogPage["nextCursor"] = null
): CatalogPage {
  return { items: ids.map((id) => makeItem(id)), nextCursor };
}

const QUERY: CatalogQuery = {
  ...EMPTY_CATALOG_QUERY,
  category: { path: "/collares", slug: "collares" },
  filters: [{ attribute: "color", values: ["dorado"] }],
  q: "perla",
  sort: "price_asc",
};

function setup({
  firstPage = makePage([1, 2], CURSOR),
  next = "ok",
  query = QUERY,
  startCursor,
}: {
  firstPage?: CatalogPage;
  next?: "fail" | "ok";
  query?: CatalogQuery;
  startCursor?: CatalogPage["nextCursor"];
} = {}) {
  const products = vi.fn((_input: unknown) => makePage([3, 4]));
  server.use(
    next === "fail"
      ? createOrpcErrorHandler("catalog.products", {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
          status: 500,
        })
      : createOrpcHandler("catalog.products", products)
  );
  const observers = stubIntersectionObserver();
  // The app's own client: the server's first page is fresh for as long as
  // it says, so the page does not ask for it again on mount. Retries off, so
  // a failed page fails at once.
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  const { result } = renderHook(
    () =>
      useCatalogProducts({
        firstPage,
        locale: "es",
        query,
        startCursor,
      }),
    { wrapper }
  );

  return { observers, products, queryClient, result };
}

describe("useCatalogProducts", () => {
  test("hands over the next page's cursor and, once pages arrive, how many and how big the last was", async () => {
    const { result } = setup();

    expect(result.current.nextCursor).toEqual(CURSOR);
    expect(result.current.loaded).toEqual({ added: 0, last: 2 });

    act(() => {
      result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(result.current.loaded).toEqual({ added: 1, last: 2 });
    });
    // The server's answer had no cursor: the list ends there.
    expect(result.current.nextCursor).toBeNull();
  });

  test("keys a list that started at a cursor apart from the first page's", () => {
    const { queryClient } = setup({ startCursor: POSITION_CURSOR });
    const [query] = queryClient.getQueryCache().getAll();

    expect(JSON.stringify(query?.queryKey)).toContain(
      JSON.stringify(POSITION_CURSOR)
    );
  });

  test("watches for the end of the list well before it reaches the window", () => {
    const { observers, result } = setup();

    act(() => {
      result.current.attachSentinel(document.createElement("div"));
    });

    expect(observers.active()?.rootMargin).toBe("0px 0px 800px 0px");
  });

  test("starts from the server's first page without asking again", () => {
    const { products, queryClient, result } = setup();

    expect(result.current.items).toEqual([makeItem(1), makeItem(2)]);
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.isFetchingNextPage).toBe(false);
    // A refetch on mount starts as the hook mounts: none is in flight.
    expect(queryClient.isFetching()).toBe(0);
    expect(products).not.toHaveBeenCalled();
  });

  test("says there is no next page when the server gave no cursor", () => {
    const { result } = setup({ firstPage: makePage([1]) });

    expect(result.current.hasNextPage).toBe(false);
  });

  test("fetches the next page with the cursor and the whole selection", async () => {
    const { products, result } = setup();

    act(() => {
      result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(result.current.items).toEqual(
        [1, 2, 3, 4].map((id) => makeItem(id))
      );
    });
    expect(products).toHaveBeenCalledExactlyOnceWith({
      category: "collares",
      cursor: CURSOR,
      filters: [{ attribute: "color", values: ["dorado"] }],
      locale: "es",
      q: "perla",
      sort: "price_asc",
    });
    expect(result.current.hasNextPage).toBe(false);
  });

  test("sends no category and no search when none is chosen", async () => {
    const { products, result } = setup({
      firstPage: makePage([1, 2], POSITION_CURSOR),
      query: EMPTY_CATALOG_QUERY,
    });

    act(() => {
      result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(products).toHaveBeenCalledExactlyOnceWith({
        cursor: POSITION_CURSOR,
        filters: [],
        locale: "es",
        sort: "position",
      });
    });
  });

  test("loads the next page when the sentinel scrolls into view", async () => {
    const { observers, products, result } = setup();
    const sentinel = document.createElement("div");

    act(() => {
      result.current.attachSentinel(sentinel);
    });
    act(() => {
      observers.active()?.emit(true);
    });

    await waitFor(() => {
      expect(result.current.items).toEqual(
        [1, 2, 3, 4].map((id) => makeItem(id))
      );
    });
    expect(products).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ cursor: CURSOR })
    );
  });

  test("a failed next page is an error state, keeping the first page", async () => {
    const { result } = setup({ next: "fail" });

    act(() => {
      result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(result.current.isFetchNextPageError).toBe(true);
    });
    expect(result.current.items).toEqual([makeItem(1), makeItem(2)]);
    expect(result.current.hasNextPage).toBe(true);
  });
});
