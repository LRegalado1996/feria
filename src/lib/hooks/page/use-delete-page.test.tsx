import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useDeletePage } from "./use-delete-page";
import { pageCurationKey } from "./use-page-curation";
import { pagesKey } from "./use-pages";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = { id: 9 };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const write = vi.fn((_input: unknown) => ({ id: 9 }));
  server.use(
    fails
      ? createOrpcErrorHandler("page.delete", {
          code: "BAD_REQUEST",
          message: "The home cannot be deleted: choose another home first",
          status: 400,
        })
      : createOrpcHandler("page.delete", write)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useDeletePage(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, result, write };
}

describe("useDeletePage", () => {
  test("deletes the page, then reads the list and the editors again", async () => {
    const { invalidateQueries, result, write } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({ id: 9 });

    expect(write).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: pagesKey() }],
      [{ queryKey: pageCurationKey() }],
    ]);
  });

  test("after a refusal reads them again too, and leaves the report to the screen", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The home cannot be deleted: choose another home first",
    });

    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: pagesKey() }],
      [{ queryKey: pageCurationKey() }],
    ]);
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
