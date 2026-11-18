import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { productsKey, useProducts } from "./use-products";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

function makeItem(id: number, title: string | null) {
  return {
    category: { id: 4, nameEn: null, nameEs: "Anillos" },
    cover: null,
    id,
    isAvailable: true,
    priceAmount: 129_000,
    slug: `articulo-${id}`,
    status: "draft",
    title,
    titleLang: title === null ? null : "es",
    updatedAt: `2026-11-15T0${id}:00:00.000Z`,
  };
}

const CURSOR = { id: 2, updatedAt: "2026-11-15T02:00:00.000Z" };
const FIRST_PAGE = {
  currencyCode: "UYU",
  items: [makeItem(2, "Anillo")],
  nextCursor: CURSOR,
};
const LAST_PAGE = {
  currencyCode: "UYU",
  items: [makeItem(1, null)],
  nextCursor: null,
};

function setup({ fails = false } = {}) {
  const list = vi.fn((input: unknown) =>
    typeof input === "object" && input !== null && "cursor" in input
      ? LAST_PAGE
      : FIRST_PAGE
  );
  server.use(
    fails
      ? createOrpcErrorHandler("product.list", {
          code: "UNAUTHORIZED",
          message: "Unauthorized",
          status: 401,
        })
      : createOrpcHandler("product.list", list)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useProducts(), { wrapper });

  return { list, queryClient: wrapper.queryClient, result };
}

describe("useProducts", () => {
  test("reads the first page of the store's articles, with no cursor", async () => {
    const { list, result } = setup();

    await waitFor(() => {
      expect(result.current.data?.pages).toEqual([FIRST_PAGE]);
    });
    expect(list).toHaveBeenCalledExactlyOnceWith({});
    expect(result.current.hasNextPage).toBe(true);
  });

  test("asks for the next page from the last one's cursor, and stops at the end", async () => {
    const { list, result } = setup();
    await waitFor(() => {
      expect(result.current.hasNextPage).toBe(true);
    });

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(list).toHaveBeenLastCalledWith({ cursor: CURSOR });
    await waitFor(() => {
      expect(result.current.data?.pages).toEqual([FIRST_PAGE, LAST_PAGE]);
    });
    expect(result.current.hasNextPage).toBe(false);
  });

  test("files its pages under the list's key", async () => {
    const { queryClient, result } = setup();
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: productsKey() })
        .map((query) => query.state.data)
    ).toEqual([{ pageParams: [undefined], pages: [FIRST_PAGE] }]);
  });

  test("fails with the server's code when the list is refused", async () => {
    const { result } = setup({ fails: true });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
    });
  });
});
