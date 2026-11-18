import { noop } from "@tanstack/react-query";
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
  currencyCode: "UYU" as const,
  id: 7,
  name: "Sample Store",
  whatsappNumber: "+59899123456",
};

/** The store as `store.update` answers it: what was sent, its id and its currency. */
const SAVED = { ...INPUT, currencyCode: "UYU" as const, id: 7 };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const update = vi.fn((_input: unknown) => SAVED);
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

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual(SAVED);

    expect(update).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(queryClient.getQueryData(storeSettingsKey())).toEqual(SAVED);
  });

  test("a read answered before the save and landing after it never puts the old settings back", async () => {
    const { queryClient, result } = setup();
    const answers: ((store: typeof LOADED) => void)[] = [];
    const stale = queryClient
      .query({
        queryFn: async () =>
          await new Promise<typeof LOADED>((resolve) => {
            answers.push(resolve);
          }),
        queryKey: storeSettingsKey(),
        staleTime: 0,
      })
      .catch(noop);

    await result.current.mutateAsync(INPUT);
    for (const answer of answers) {
      answer(LOADED);
    }
    await stale;

    expect(queryClient.getQueryData(storeSettingsKey())).toEqual(SAVED);
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
