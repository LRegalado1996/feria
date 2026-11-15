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

const CURSOR = { id: 2, publishedAt: "2026-11-01T12:00:00.000Z" };

function makePage(
  ids: number[],
  nextCursor: CatalogPage["nextCursor"] = null
): CatalogPage {
  return { items: ids.map((id) => makeItem(id)), nextCursor };
}

const QUERY: CatalogQuery = {
  ...EMPTY_CATALOG_QUERY,
  category: "collares",
  filters: [{ attribute: "color", values: ["dorado"] }],
  q: "perla",
  sort: "price_asc",
};

function setup({
  firstPage = makePage([1, 2], CURSOR),
  next = "ok",
  query = QUERY,
}: {
  firstPage?: CatalogPage;
  next?: "fail" | "ok";
  query?: CatalogQuery;
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
        storeSlug: "lr-market",
      }),
    { wrapper }
  );

  return { observers, products, result };
}

describe("useCatalogProducts", () => {
  test("starts from the server's first page without asking again", async () => {
    const { products, result } = setup();

    expect(result.current.items).toEqual([makeItem(1), makeItem(2)]);
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.isFetchingNextPage).toBe(false);
    // Time for a refetch on mount to go out, were there one.
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
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
      storeSlug: "lr-market",
    });
    expect(result.current.hasNextPage).toBe(false);
  });

  test("sends no category and no search when none is chosen", async () => {
    const { products, result } = setup({ query: EMPTY_CATALOG_QUERY });

    act(() => {
      result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(products).toHaveBeenCalledExactlyOnceWith({
        cursor: CURSOR,
        filters: [],
        locale: "es",
        sort: "newest",
        storeSlug: "lr-market",
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
