import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useDeleteBanner } from "./use-delete-banner";
import { pageCurationKey } from "./use-page-curation";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

function setup({ fails = false }: { fails?: boolean } = {}) {
  const remove = vi.fn((_input: unknown) => ({ id: 31 }));
  server.use(
    fails
      ? createOrpcErrorHandler("page.deleteBanner", {
          code: "NOT_FOUND",
          message: "Banner not found",
          status: 404,
        })
      : createOrpcHandler("page.deleteBanner", remove)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useDeleteBanner(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, remove, result };
}

describe("useDeleteBanner", () => {
  test("deletes the banner by its id, then reads the home again", async () => {
    const { invalidateQueries, remove, result } = setup();

    await expect(result.current.mutateAsync({ id: 31 })).resolves.toEqual({
      id: 31,
    });

    expect(remove).toHaveBeenCalledExactlyOnceWith({ id: 31 });
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: pageCurationKey(),
    });
  });

  test("after a refusal reads the home again too, and leaves the report to the screen", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync({ id: 31 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Banner not found",
    });

    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: pageCurationKey(),
    });
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
