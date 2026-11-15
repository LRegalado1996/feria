import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { storeCategoriesKey, useStoreCategories } from "./use-store-categories";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const ROWS = [
  {
    id: 1,
    nameEn: "Necklaces",
    nameEs: "Collares",
    position: 0,
    productCount: 3,
    slug: "collares",
  },
  {
    id: 2,
    nameEn: null,
    nameEs: "Aros",
    position: 1,
    productCount: 0,
    slug: "aros",
  },
];

function setup({ fails = false }: { fails?: boolean } = {}) {
  const list = vi.fn((_input: unknown) => ROWS);
  server.use(
    fails
      ? createOrpcErrorHandler("category.list", {
          code: "NOT_FOUND",
          message: "Store not found",
          status: 404,
        })
      : createOrpcHandler("category.list", list)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useStoreCategories("lr-market"), {
    wrapper,
  });

  return { list, queryClient: wrapper.queryClient, result };
}

describe("useStoreCategories", () => {
  test("reads the store's categories, cached under the list key", async () => {
    const { list, queryClient, result } = setup();

    await waitFor(() => {
      expect(result.current.data).toEqual(ROWS);
    });
    expect(list).toHaveBeenCalledExactlyOnceWith({ storeSlug: "lr-market" });
    expect(queryClient.getQueryData(storeCategoriesKey("lr-market"))).toEqual(
      ROWS
    );
  });

  test("keys each store's list apart", () => {
    expect(storeCategoriesKey("lr-market")).toEqual([
      "category",
      "list",
      { input: { storeSlug: "lr-market" } },
    ]);
    expect(storeCategoriesKey("tienda-demo")).not.toEqual(
      storeCategoriesKey("lr-market")
    );
  });

  test("answers a refused read as an error, never as an empty list", async () => {
    const { result } = setup({ fails: true });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({
        code: "NOT_FOUND",
        message: "Store not found",
      });
    });
    expect(result.current.data).toBeUndefined();
  });
});
