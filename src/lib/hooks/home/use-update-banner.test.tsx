import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { UpdateBannerValues } from "@/lib/schemas/home";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { homeCurationKey } from "./use-home-curation";
import { useUpdateBanner } from "./use-update-banner";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// The photos left out: the form did not change them.
const INPUT: UpdateBannerValues = {
  ctaLabelEn: null,
  ctaLabelEs: null,
  endsOn: "2027-01-05",
  id: 31,
  isActive: false,
  link: { kind: "url", url: "/productos" },
  placement: "cover",
  startsOn: null,
  titleEn: "Bubble guns",
  titleEs: "Burbujeros",
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const update = vi.fn((_input: unknown) => ({ id: 31 }));
  server.use(
    fails
      ? createOrpcErrorHandler("home.updateBanner", {
          code: "NOT_FOUND",
          message: "Banner not found",
          status: 404,
        })
      : createOrpcHandler("home.updateBanner", update)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useUpdateBanner(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, result, update };
}

describe("useUpdateBanner", () => {
  test("sends the edit, then reads the home again", async () => {
    const { invalidateQueries, result, update } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 31,
    });

    expect(update).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: homeCurationKey(),
    });
  });

  test("rejects a refused edit with its code, leaving the home and the report to the form", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Banner not found",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
