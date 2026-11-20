import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useDeleteSpotlight } from "./use-delete-spotlight";
import { pageCurationKey } from "./use-page-curation";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

function setup({ fails = false }: { fails?: boolean } = {}) {
  const remove = vi.fn((_input: unknown) => ({ id: 51 }));
  server.use(
    fails
      ? createOrpcErrorHandler("page.deleteSpotlight", {
          code: "NOT_FOUND",
          message: "Spotlight not found",
          status: 404,
        })
      : createOrpcHandler("page.deleteSpotlight", remove)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useDeleteSpotlight(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, remove, result };
}

describe("useDeleteSpotlight", () => {
  test("deletes the spotlight by its id, then reads the pages again", async () => {
    const { invalidateQueries, remove, result } = setup();

    await expect(result.current.mutateAsync({ id: 51 })).resolves.toEqual({
      id: 51,
    });

    expect(remove).toHaveBeenCalledExactlyOnceWith({ id: 51 });
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: pageCurationKey(),
    });
  });

  test("after a refusal reads the pages again too, and leaves the report to the screen", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync({ id: 51 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Spotlight not found",
    });

    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: pageCurationKey(),
    });
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
