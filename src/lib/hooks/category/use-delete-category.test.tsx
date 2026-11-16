import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useDeleteCategory } from "./use-delete-category";
import { storeCategoriesKey } from "./use-store-categories";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = { id: 5, moveToId: 6, storeSlug: "lr-market" };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const remove = vi.fn((_input: unknown) => ({ id: 5, movedArticles: 3 }));
  server.use(
    fails
      ? createOrpcErrorHandler("category.delete", {
          code: "BAD_REQUEST",
          message: "Choose another category for its articles",
          status: 400,
        })
      : createOrpcHandler("category.delete", remove)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useDeleteCategory("lr-market"), {
    wrapper,
  });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, remove, result };
}

describe("useDeleteCategory", () => {
  test("sends the id and where its articles move, then reads the store's list again", async () => {
    const { invalidateQueries, remove, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 5,
      movedArticles: 3,
    });

    expect(remove).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeCategoriesKey("lr-market"),
    });
  });

  test("rejects a refused deletion with its code, reads the list again, and leaves the report to the dialog", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Choose another category for its articles",
    });

    // The category may have gained articles since the list was read.
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeCategoriesKey("lr-market"),
    });
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
