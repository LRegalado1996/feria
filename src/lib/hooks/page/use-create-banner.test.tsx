import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { CreateBannerValues } from "@/lib/schemas/page";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCreateBanner } from "./use-create-banner";
import { pageCurationKey } from "./use-page-curation";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT: CreateBannerValues = {
  ctaLabelEn: null,
  ctaLabelEs: "Ver joyas",
  endsOn: null,
  image: {
    height: 1067,
    url: "https://store9.public.blob.vercel-storage.com/local/banner/11111111-1111-4111-8111-111111111111.webp",
    width: 1600,
  },
  imagePhone: null,
  isActive: true,
  link: { categoryId: 4, kind: "category" },
  pageId: 1,
  placement: "rows",
  rowsIndex: 2,
  startsOn: null,
  titleEn: null,
  titleEs: "Joyas para regalar",
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const create = vi.fn((_input: unknown) => ({ id: 31 }));
  server.use(
    fails
      ? createOrpcErrorHandler("page.createBanner", {
          code: "BAD_REQUEST",
          message: "A banner photo must be one uploaded to this store",
          status: 400,
        })
      : createOrpcHandler("page.createBanner", create)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useCreateBanner(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { create, invalidateQueries, metas, result };
}

describe("useCreateBanner", () => {
  test("sends the new banner, then reads the home again", async () => {
    const { create, invalidateQueries, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 31,
    });

    expect(create).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: pageCurationKey(),
    });
  });

  test("rejects a refused banner with its code, leaving the home and the report to the form", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A banner photo must be one uploaded to this store",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
