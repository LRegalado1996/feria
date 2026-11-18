import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { productKey } from "./use-product";
import { productsKey } from "./use-products";
import { usePublishProduct } from "./use-publish-product";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const ANSWER = { id: 12, slug: "anillo-de-plata", status: "published" };

function setup({ fails = false } = {}) {
  const publish = vi.fn((_input: unknown) => ANSWER);
  server.use(
    fails
      ? createOrpcErrorHandler("product.publish", {
          code: "BAD_REQUEST",
          message: "The article cannot be published yet. Missing: price",
          status: 400,
        })
      : createOrpcHandler("product.publish", publish)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => usePublishProduct(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { publish, invalidateQueries, metas, result };
}

describe("usePublishProduct", () => {
  test("sends the article's id, then reads it and the list again", async () => {
    const { publish, invalidateQueries, result } = setup();

    await expect(result.current.mutateAsync({ id: 12 })).resolves.toEqual(
      ANSWER
    );

    expect(publish).toHaveBeenCalledExactlyOnceWith({ id: 12 });
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: productKey(12) }],
      [{ queryKey: productsKey() }],
    ]);
  });

  test("rejects with the server's code and message, reading nothing again", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync({ id: 12 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The article cannot be published yet. Missing: price",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
