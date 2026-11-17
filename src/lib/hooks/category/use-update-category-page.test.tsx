import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { storeCategoriesKey } from "./use-store-categories";
import { useUpdateCategoryPage } from "./use-update-category-page";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = {
  coverAltEn: null,
  coverAltEs: "Anillo sello dorado",
  id: 3,
  parentId: 6,
  seoDescriptionEn: null,
  seoDescriptionEs: "Anillos de la feria",
  seoTitleEn: "Rings",
  seoTitleEs: null,
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const update = vi.fn((_input: unknown) => ({ id: 3, parentId: 6 }));
  server.use(
    fails
      ? createOrpcErrorHandler("category.updatePage", {
          code: "BAD_REQUEST",
          message: "A group cannot join another group",
          status: 400,
        })
      : createOrpcHandler("category.updatePage", update)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useUpdateCategoryPage(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, result, update };
}

describe("useUpdateCategoryPage", () => {
  test("sends the category's group and texts, then reads the store's list again", async () => {
    const { invalidateQueries, result, update } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 3,
      parentId: 6,
    });

    expect(update).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeCategoriesKey(),
    });
  });

  test("rejects a refused page with its code, leaves the list and the report to the form", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A group cannot join another group",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
