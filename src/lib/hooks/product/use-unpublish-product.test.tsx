import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { productKey } from "./use-product";
import { productsKey } from "./use-products";
import { useUnpublishProduct } from "./use-unpublish-product";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const ANSWER = { id: 12, slug: "anillo-de-plata", status: "draft" };

function setup({ fails = false } = {}) {
  const unpublish = vi.fn((_input: unknown) => ANSWER);
  server.use(
    fails
      ? createOrpcErrorHandler("product.unpublish", {
          code: "NOT_FOUND",
          message: "Article not found",
          status: 404,
        })
      : createOrpcHandler("product.unpublish", unpublish)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useUnpublishProduct(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { unpublish, invalidateQueries, metas, result };
}

describe("useUnpublishProduct", () => {
  test("sends the article's id, then reads it and the list again", async () => {
    const { unpublish, invalidateQueries, result } = setup();

    await expect(result.current.mutateAsync({ id: 12 })).resolves.toEqual(
      ANSWER
    );

    expect(unpublish).toHaveBeenCalledExactlyOnceWith({ id: 12 });
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: productKey(12) }],
      [{ queryKey: productsKey() }],
    ]);
  });

  test("rejects with the server's code and message, reading nothing again", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync({ id: 12 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Article not found",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
