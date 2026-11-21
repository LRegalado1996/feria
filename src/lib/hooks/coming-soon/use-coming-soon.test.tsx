import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { comingSoonKey, useComingSoon } from "./use-coming-soon";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const PAGE = {
  countdownTo: "2026-12-20",
  published: true,
  translations: [
    {
      eyebrow: null,
      headline: "Abrimos",
      lead: null,
      locale: "es",
      marquee: "Bijou",
    },
  ],
};

function setup({ fails = false }: { fails?: boolean } = {}) {
  const get = vi.fn((_input: unknown) => PAGE);
  server.use(
    fails
      ? createOrpcErrorHandler("comingSoon.get", {
          code: "UNAUTHORIZED",
          message: "Unauthorized",
          status: 401,
        })
      : createOrpcHandler("comingSoon.get", get)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useComingSoon(), { wrapper });

  return { get, queryClient: wrapper.queryClient, result };
}

describe("useComingSoon", () => {
  test("reads the page, cached under its key", async () => {
    const { get, queryClient, result } = setup();

    await waitFor(() => {
      expect(result.current.data).toEqual(PAGE);
    });
    expect(get).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(queryClient.getQueryData(comingSoonKey())).toEqual(PAGE);
  });

  test("fails with the server's code, never an empty page", async () => {
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
