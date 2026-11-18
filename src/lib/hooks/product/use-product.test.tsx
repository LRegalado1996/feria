import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { productKey, useProduct } from "./use-product";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const ARTICLE = {
  id: 12,
  slug: "anillo-de-plata",
  status: "draft",
  updatedAt: "2026-11-15T09:30:00.000Z",
};

function setup({
  fails = false,
  id = 12 as number | null,
}: { fails?: boolean; id?: number | null } = {}) {
  const get = vi.fn((_input: unknown) => ARTICLE);
  server.use(
    fails
      ? createOrpcErrorHandler("product.get", {
          code: "NOT_FOUND",
          message: "Article not found",
          status: 404,
        })
      : createOrpcHandler("product.get", get)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useProduct(id), { wrapper });

  return { get, queryClient: wrapper.queryClient, result };
}

describe("useProduct", () => {
  test("reads the article by its id, under its own key", async () => {
    const { get, queryClient, result } = setup();

    await waitFor(() => {
      expect(result.current.data).toEqual(ARTICLE);
    });
    expect(get).toHaveBeenCalledExactlyOnceWith({ id: 12 });
    expect(queryClient.getQueryData(productKey(12))).toEqual(ARTICLE);
  });

  test("reads nothing while there is no article yet", async () => {
    const { get, result } = setup({ id: null });

    // A macrotask: a read that was going to start has started by then.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(get).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("never reads again on its own once read", async () => {
    const { queryClient, result } = setup();
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [query] = queryClient
      .getQueryCache()
      .findAll({ queryKey: productKey(12) });
    expect(query?.observers[0]?.options).toMatchObject({
      refetchOnWindowFocus: false,
      staleTime: Number.POSITIVE_INFINITY,
    });
    expect(query?.isStale()).toBe(false);
  });

  test("fails with NOT_FOUND for an article the store does not have", async () => {
    const { result } = setup({ fails: true });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({
        code: "NOT_FOUND",
        message: "Article not found",
      });
    });
  });
});
