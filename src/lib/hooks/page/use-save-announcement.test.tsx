import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { SaveAnnouncementValues } from "@/lib/schemas/page";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { pageCurationKey } from "./use-page-curation";
import { useSaveAnnouncement } from "./use-save-announcement";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT: SaveAnnouncementValues = {
  endsOn: "2027-01-05",
  isActive: true,
  linkUrl: "/productos",
  shortTextEn: null,
  shortTextEs: "En la feria",
  startsOn: "2026-12-05",
  textEn: null,
  textEs: "Encontranos en la feria, del 5/12 al 5/1",
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const save = vi.fn((_input: unknown) => ({ id: 3 }));
  server.use(
    fails
      ? createOrpcErrorHandler("page.saveAnnouncement", {
          code: "BAD_REQUEST",
          message: "A Spanish text is required",
          status: 400,
        })
      : createOrpcHandler("page.saveAnnouncement", save)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useSaveAnnouncement(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, result, save };
}

describe("useSaveAnnouncement", () => {
  test("sends the announcement, then reads the home again", async () => {
    const { invalidateQueries, result, save } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      id: 3,
    });

    expect(save).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: pageCurationKey(),
    });
  });

  test("rejects a refused save with its code, leaving the home and the report to the screen", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "A Spanish text is required",
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
