import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { toProductValues } from "@/lib/catalog/product-form";
import { makeProductForm } from "@/test/factories/store-product";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCreateProduct } from "./use-create-product";
import { productsKey } from "./use-products";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = toProductValues(makeProductForm());
const CREATED = {
  id: 12,
  publishGaps: [],
  slug: "anillo-de-plata",
  status: "draft",
  updatedAt: "2026-11-15T09:30:00.000Z",
};

function setup({ fails = false } = {}) {
  const create = vi.fn((_input: unknown) => CREATED);
  server.use(
    fails
      ? createOrpcErrorHandler("product.create", {
          code: "BAD_REQUEST",
          message: "An article photo must be one uploaded to this store",
          status: 400,
        })
      : createOrpcHandler("product.create", create)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useCreateProduct(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { create, invalidateQueries, metas, result };
}

describe("useCreateProduct", () => {
  test("sends the whole article and reads the list again once created", async () => {
    const { create, invalidateQueries, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual(CREATED);

    expect(create).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: productsKey(),
    });
  });

  test("rejects a refused article with its code, leaving the list and the report to the caller", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "An article photo must be one uploaded to this store",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
