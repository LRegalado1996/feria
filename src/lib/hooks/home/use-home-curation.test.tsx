import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { makeHomeCuration } from "@/test/factories/home-curation";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { homeCurationKey, useHomeCuration } from "./use-home-curation";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

function setup({ fails = false }: { fails?: boolean } = {}) {
  const curation = makeHomeCuration({ rankingProductIds: [21] });
  const get = vi.fn((_input: unknown) => curation);
  server.use(
    fails
      ? createOrpcErrorHandler("home.get", {
          code: "UNAUTHORIZED",
          message: "Unauthorized",
          status: 401,
        })
      : createOrpcHandler("home.get", get)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useHomeCuration(), { wrapper });

  return { curation, get, queryClient: wrapper.queryClient, result };
}

describe("useHomeCuration", () => {
  test("reads the home's curation, cached under its key", async () => {
    const { curation, get, queryClient, result } = setup();

    await waitFor(() => {
      expect(result.current.data).toEqual(curation);
    });
    expect(get).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(queryClient.getQueryData(homeCurationKey())).toEqual(curation);
  });

  test("fails with the server's code, never an empty home", async () => {
    const { result } = setup({ fails: true });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
    });
    expect(result.current.data).toBeUndefined();
  });
});
