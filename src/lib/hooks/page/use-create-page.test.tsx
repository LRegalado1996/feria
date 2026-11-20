import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCreatePage } from "./use-create-page";
import { pageCurationKey } from "./use-page-curation";
import { pagesKey } from "./use-pages";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = {
  isPublished: false,
  nameEn: "Gifts",
  nameEs: "Regalos",
  seoDescriptionEn: "",
  seoDescriptionEs: "",
  seoTitleEn: "",
  seoTitleEs: "",
  showInHeader: false,
  slug: "regalos",
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const write = vi.fn((_input: unknown) => ({ id: 9 }));
  server.use(
    fails
      ? createOrpcErrorHandler("page.create", {
          code: "CONFLICT",
          message: "Another page or category already has that address",
          status: 409,
        })
      : createOrpcHandler("page.create", write)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useCreatePage(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, result, write };
}

describe("useCreatePage", () => {
  test("creates the page, then reads the list and the editors again", async () => {
    const { invalidateQueries, result, write } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({ id: 9 });

    expect(write).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: pagesKey() }],
      [{ queryKey: pageCurationKey() }],
    ]);
  });

  test("refused, reads nothing again, and leaves the report to the screen", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Another page or category already has that address",
    });

    expect(invalidateQueries.mock.calls).toEqual([]);
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
