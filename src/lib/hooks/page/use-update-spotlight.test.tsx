import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { UpdateSpotlightValues } from "@/lib/schemas/page";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { pageCurationKey } from "./use-page-curation";
import { useUpdateSpotlight } from "./use-update-spotlight";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// The photos left out: the form did not change them.
const INPUT: UpdateSpotlightValues = {
  id: 51,
  labelEn: "New",
  labelEs: "Nuevo",
  pageId: 1,
  phraseEn: null,
  phraseEs: "El que más piden los chicos.",
  productId: 21,
  rowsIndex: 0,
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const update = vi.fn((_input: unknown) => ({ id: 51 }));
  server.use(
    fails
      ? createOrpcErrorHandler("page.updateSpotlight", {
          code: "NOT_FOUND",
          message: "Spotlight not found",
          status: 404,
        })
      : createOrpcHandler("page.updateSpotlight", update)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useUpdateSpotlight(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, result, update };
}

describe("useUpdateSpotlight", () => {
  test("sends the edit, then reads the pages again", async () => {
    const { invalidateQueries, result, update } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 51,
    });

    expect(update).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: pageCurationKey(),
    });
  });

  test("rejects a refused edit with its code, leaving the pages and the report to the form", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Spotlight not found",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
