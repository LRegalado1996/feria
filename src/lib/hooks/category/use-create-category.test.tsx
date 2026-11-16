import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCreateCategory } from "./use-create-category";
import { storeCategoriesKey } from "./use-store-categories";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = { nameEn: null, nameEs: "Collares", storeSlug: "lr-market" };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const create = vi.fn((_input: unknown) => ({
    id: 7,
    position: 2,
    slug: "collares",
  }));
  server.use(
    fails
      ? createOrpcErrorHandler("category.create", {
          code: "CONFLICT",
          message: "Another category of this store already has that name",
          status: 409,
        })
      : createOrpcHandler("category.create", create)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useCreateCategory("lr-market"), {
    wrapper,
  });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { create, invalidateQueries, metas, result };
}

describe("useCreateCategory", () => {
  test("sends the names and reads the store's list again once saved", async () => {
    const { create, invalidateQueries, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 7,
      position: 2,
      slug: "collares",
    });

    expect(create).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeCategoriesKey("lr-market"),
    });
  });

  test("rejects a refused name with its code, leaves the list and the report to the form", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Another category of this store already has that name",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
