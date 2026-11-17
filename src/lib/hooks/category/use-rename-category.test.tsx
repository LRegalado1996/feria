import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useRenameCategory } from "./use-rename-category";
import { storeCategoriesKey } from "./use-store-categories";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = {
  id: 5,
  nameEn: "Necklaces",
  nameEs: "Collares",
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const rename = vi.fn((_input: unknown) => ({ id: 5, slug: "cadenas" }));
  server.use(
    fails
      ? createOrpcErrorHandler("category.rename", {
          code: "NOT_FOUND",
          message: "Category not found",
          status: 404,
        })
      : createOrpcHandler("category.rename", rename)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useRenameCategory(), {
    wrapper,
  });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, rename, result };
}

describe("useRenameCategory", () => {
  test("sends the id and both names, then reads the store's list again", async () => {
    const { invalidateQueries, rename, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 5,
      slug: "cadenas",
    });

    expect(rename).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeCategoriesKey(),
    });
  });

  test("rejects a failed rename with its code, leaves the list and the report to the form", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Category not found",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
