import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { comingSoonKey } from "./use-coming-soon";
import { useSetComingSoonPublished } from "./use-set-coming-soon-published";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const LOADED = {
  countdownTo: "2026-12-20",
  published: false,
  translations: [
    {
      eyebrow: null,
      headline: "Abrimos",
      lead: null,
      locale: "es" as const,
      marquee: null,
    },
  ],
};

function setup({
  fails = false,
  loaded = true,
}: { fails?: boolean; loaded?: boolean } = {}) {
  const setPublished = vi.fn((input: unknown) => input);
  server.use(
    fails
      ? createOrpcErrorHandler("comingSoon.setPublished", {
          code: "UNAUTHORIZED",
          message: "Unauthorized",
          status: 401,
        })
      : createOrpcHandler("comingSoon.setPublished", setPublished)
  );
  const wrapper = createQueryWrapper();
  if (loaded) {
    wrapper.queryClient.setQueryData(comingSoonKey(), LOADED);
  }
  const { result } = renderHook(() => useSetComingSoonPublished(), {
    wrapper,
  });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { metas, queryClient: wrapper.queryClient, result, setPublished };
}

describe("useSetComingSoonPublished", () => {
  test("sends the new position, and the screen's copy takes it, its texts untouched", async () => {
    const { queryClient, result, setPublished } = setup();

    await expect(
      result.current.mutateAsync({ published: true })
    ).resolves.toEqual({ published: true });

    expect(setPublished).toHaveBeenCalledExactlyOnceWith({ published: true });
    expect(queryClient.getQueryData(comingSoonKey())).toEqual({
      ...LOADED,
      published: true,
    });
  });

  test("with no page loaded yet, stores nothing it does not have", async () => {
    const { queryClient, result } = setup({ loaded: false });

    await result.current.mutateAsync({ published: true });

    expect(queryClient.getQueryData(comingSoonKey())).toBeUndefined();
  });

  test("never says the new position before the server stored it: a refusal keeps the old one", async () => {
    const { metas, queryClient, result } = setup({ fails: true });

    await expect(
      result.current.mutateAsync({ published: true })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Unauthorized" });

    expect(queryClient.getQueryData(comingSoonKey())).toEqual(LOADED);
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
