import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { pageCurationKey } from "./use-page-curation";
import { pagesKey } from "./use-pages";
import { useSetHomePage } from "./use-set-home-page";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = { pageId: 9 };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const write = vi.fn((_input: unknown) => ({
    homePageId: 9,
    previousHomeId: 1,
  }));
  server.use(
    fails
      ? createOrpcErrorHandler("page.setHome", {
          code: "BAD_REQUEST",
          message: "Only a published page can be the home",
          status: 400,
        })
      : createOrpcHandler("page.setHome", write)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useSetHomePage(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, result, write };
}

describe("useSetHomePage", () => {
  test("makes the page the home, then reads the list and the editors again", async () => {
    const { invalidateQueries, result, write } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      homePageId: 9,
      previousHomeId: 1,
    });

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
      message: "Only a published page can be the home",
    });

    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: pagesKey() }],
      [{ queryKey: pageCurationKey() }],
    ]);
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
