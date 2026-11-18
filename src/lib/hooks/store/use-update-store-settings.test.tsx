import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { storeSettingsKey } from "./use-store-settings";
import { useUpdateStoreSettings } from "./use-update-store-settings";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = {
  currencyCode: "UYU" as const,
  instagramUrl: null,
  name: "Renamed Store",
  tiktokUrl: null,
  translations: [
    { description: "Anillos.", locale: "es" as const, tagline: "Hola" },
  ],
  whatsappNumber: "+59898765432",
};

const LOADED = {
  ...INPUT,
  id: 7,
  name: "Sample Store",
  whatsappNumber: "+59899123456",
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const update = vi.fn((_input: unknown) => ({ ...INPUT, id: 7 }));
  server.use(
    fails
      ? createOrpcErrorHandler("store.update", {
          code: "BAD_REQUEST",
          message: "Input validation failed",
          status: 400,
        })
      : createOrpcHandler("store.update", update)
  );
  const wrapper = createQueryWrapper();
  wrapper.queryClient.setQueryData(storeSettingsKey(), LOADED);
  const { result } = renderHook(() => useUpdateStoreSettings(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { metas, queryClient: wrapper.queryClient, result, update };
}

describe("useUpdateStoreSettings", () => {
  test("sends every setting, and the saved store becomes the screen's copy", async () => {
    const { queryClient, result, update } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual({
      ...INPUT,
      id: 7,
    });

    expect(update).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(queryClient.getQueryData(storeSettingsKey())).toEqual({
      ...INPUT,
      id: 7,
    });
  });

  test("rejects a refused save with its code, keeps the copy it had, and leaves the report to the screen", async () => {
    const { metas, queryClient, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });

    expect(queryClient.getQueryData(storeSettingsKey())).toEqual(LOADED);
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
