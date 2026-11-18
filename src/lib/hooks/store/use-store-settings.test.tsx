import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { storeSettingsKey, useStoreSettings } from "./use-store-settings";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const STORE = {
  currencyCode: "UYU",
  id: 7,
  instagramUrl: "https://instagram.com/sample",
  name: "Sample Store",
  tiktokUrl: null,
  translations: [
    { description: "Anillos y cadenas.", locale: "es", tagline: "Hola" },
  ],
  whatsappNumber: "+59899123456",
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const get = vi.fn((_input: unknown) => STORE);
  server.use(
    fails
      ? createOrpcErrorHandler("store.get", {
          code: "NOT_FOUND",
          message: "Store not found",
          status: 404,
        })
      : createOrpcHandler("store.get", get)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useStoreSettings(), { wrapper });

  return { get, queryClient: wrapper.queryClient, result };
}

describe("useStoreSettings", () => {
  test("reads the store, cached under the settings key", async () => {
    const { get, queryClient, result } = setup();

    await waitFor(() => {
      expect(result.current.data).toEqual(STORE);
    });
    expect(get).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(queryClient.getQueryData(storeSettingsKey())).toEqual(STORE);
  });

  test("fails with the server's code, never an empty store", async () => {
    const { result } = setup({ fails: true });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({
        code: "NOT_FOUND",
        message: "Store not found",
      });
    });
    expect(result.current.data).toBeUndefined();
  });
});
