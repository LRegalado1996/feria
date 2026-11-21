import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { CreateSpotlightValues } from "@/lib/schemas/page";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCreateSpotlight } from "./use-create-spotlight";
import { pageCurationKey } from "./use-page-curation";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT: CreateSpotlightValues = {
  labelEn: "New",
  labelEs: "Nuevo",
  pageId: 1,
  phraseEn: null,
  phraseEs: "El que más piden los chicos.",
  productId: 21,
  rowsIndex: 0,
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const create = vi.fn((_input: unknown) => ({ id: 51 }));
  server.use(
    fails
      ? createOrpcErrorHandler("page.createSpotlight", {
          code: "NOT_FOUND",
          message: "Article not found",
          status: 404,
        })
      : createOrpcHandler("page.createSpotlight", create)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useCreateSpotlight(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { create, invalidateQueries, metas, result };
}

describe("useCreateSpotlight", () => {
  test("sends the new spotlight, then reads the pages again", async () => {
    const { create, invalidateQueries, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 51,
    });

    expect(create).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: pageCurationKey(),
    });
  });

  test("rejects a refused spotlight with its code, leaving the pages and the report to the form", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Article not found",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
