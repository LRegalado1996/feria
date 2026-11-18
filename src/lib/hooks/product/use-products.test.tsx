import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { ListStoreProductsInput } from "@/lib/schemas/catalog";
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

/** The page the server answers for `page`: one article, numbered by it. */
function makePage(page: number) {
  return {
    currencyCode: "UYU",
    items: [makeItem(page, `Anillo ${page}`)],
    limit: 24,
    page,
    pageCount: 3,
    total: 49,
    totalCapped: false,
  };
}

/** The hook over `product.list`, which answers the page asked for. */
function setup({
  enabled,
  fails = false,
  input = { locale: "es" },
}: {
  enabled?: boolean;
  fails?: boolean;
  input?: ListStoreProductsInput;
} = {}) {
  const list = vi.fn((asked: unknown) =>
    makePage(
      typeof asked === "object" &&
        asked !== null &&
        "page" in asked &&
        typeof asked.page === "number"
        ? asked.page
        : 1
    )
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
  const view = renderHook(
    ({ asked }: { asked: ListStoreProductsInput }) =>
      useProducts(asked, enabled === undefined ? undefined : { enabled }),
    { initialProps: { asked: input }, wrapper }
  );

  return {
    list,
    queryClient: wrapper.queryClient,
    /** The same hook asked for `asked` instead. */
    ask: (asked: ListStoreProductsInput) => {
      view.rerender({ asked });
    },
    result: view.result,
  };
}

describe("useProducts", () => {
  test("reads the page asked for, sending the input as it is given", async () => {
    const { list, result } = setup({
      input: { locale: "en", page: 2, q: "aro", sort: "price" },
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(makePage(2));
    });
    expect(list).toHaveBeenCalledExactlyOnceWith({
      locale: "en",
      page: 2,
      q: "aro",
      sort: "price",
    });
  });

  test("keeps the last page on screen while another one loads", async () => {
    const { ask, list, result } = setup();
    await waitFor(() => {
      expect(result.current.data).toEqual(makePage(1));
    });

    ask({ locale: "es", page: 3 });

    expect(result.current.data).toEqual(makePage(1));
    expect(result.current.isPlaceholderData).toBe(true);
    await waitFor(() => {
      expect(result.current.data).toEqual(makePage(3));
    });
    expect(result.current.isPlaceholderData).toBe(false);
    expect(list).toHaveBeenLastCalledWith({ locale: "es", page: 3 });
  });

  test("sends nothing while it is not enabled", async () => {
    const { list, result } = setup({ enabled: false });

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe("idle");
    });
    expect(result.current.data).toBeUndefined();
    expect(list).not.toHaveBeenCalled();
  });

  test("files every page under the prefix a save invalidates", async () => {
    const { ask, queryClient, result } = setup();
    await waitFor(() => {
      expect(result.current.data).toEqual(makePage(1));
    });
    ask({ locale: "es", page: 2, status: "draft" });
    await waitFor(() => {
      expect(result.current.data).toEqual(makePage(2));
    });

    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: productsKey() })
        .map((query) => query.state.data)
    ).toEqual([makePage(1), makePage(2)]);
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
