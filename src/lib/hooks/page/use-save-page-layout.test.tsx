import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { SavePageLayoutValues } from "@/lib/schemas/page";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { pageCurationKey } from "./use-page-curation";
import { useSavePageLayout } from "./use-save-page-layout";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT: SavePageLayoutValues & { pageId: number } = {
  coverBannerIds: [32, 31],
  pageId: 1,
  featuredProductIds: [21, 22],
  rankingProductIds: [23],
  sections: [
    { categoryId: 4, kind: "category" },
    { kind: "featured" },
    { kind: "best_sellers" },
  ],
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const save = vi.fn((_input: unknown) => INPUT);
  server.use(
    fails
      ? createOrpcErrorHandler("page.saveLayout", {
          code: "NOT_FOUND",
          message: "Article not found",
          status: 404,
        })
      : createOrpcHandler("page.saveLayout", save)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useSavePageLayout(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, result, save };
}

describe("useSavePageLayout", () => {
  test("sends the whole order, then reads the pages again", async () => {
    const { invalidateQueries, result, save } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual(INPUT);

    expect(save).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: pageCurationKey(),
    });
  });

  test("rejects a refused order with its code, leaving the home and the report to the screen", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Article not found",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
