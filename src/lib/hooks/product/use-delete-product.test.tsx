import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { makeStoreProduct } from "@/test/factories/store-product";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useDeleteProduct } from "./use-delete-product";
import { productKey } from "./use-product";
import { productsKey } from "./use-products";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

function setup({ fails = false } = {}) {
  const remove = vi.fn((_input: unknown) => ({ id: 12 }));
  server.use(
    fails
      ? createOrpcErrorHandler("product.delete", {
          code: "NOT_FOUND",
          message: "Article not found",
          status: 404,
        })
      : createOrpcHandler("product.delete", remove)
  );
  const wrapper = createQueryWrapper();
  const { queryClient } = wrapper;
  queryClient.setQueryData(productKey(12), makeStoreProduct());
  queryClient.setQueryData(productKey(13), makeStoreProduct({ id: 13 }));
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(() => useDeleteProduct(), { wrapper });

  return { invalidateQueries, queryClient, remove, result };
}

describe("useDeleteProduct", () => {
  test("deletes the article, forgets its read and reads the list again", async () => {
    const { invalidateQueries, queryClient, remove, result } = setup();

    await expect(result.current.mutateAsync({ id: 12 })).resolves.toEqual({
      id: 12,
    });

    expect(remove).toHaveBeenCalledExactlyOnceWith({ id: 12 });
    expect(queryClient.getQueryData(productKey(12))).toBeUndefined();
    expect(queryClient.getQueryData(productKey(13))).toEqual(
      makeStoreProduct({ id: 13 })
    );
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: productsKey(),
    });
  });

  test("keeps the read and the list when the delete is refused", async () => {
    const { invalidateQueries, queryClient, result } = setup({ fails: true });

    await expect(result.current.mutateAsync({ id: 12 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Article not found",
    });

    expect(queryClient.getQueryData(productKey(12))).toEqual(
      makeStoreProduct()
    );
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
