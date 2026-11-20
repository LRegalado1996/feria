import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { pagesKey, usePages } from "./use-pages";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const ROWS = [
  {
    id: 1,
    isHome: true,
    isPublished: true,
    nameEn: "Home",
    nameEs: "Home",
    showInHeader: false,
    slug: "home",
  },
];

function setup({ fails = false }: { fails?: boolean } = {}) {
  const list = vi.fn((_input: unknown) => ROWS);
  server.use(
    fails
      ? createOrpcErrorHandler("page.list", {
          code: "UNAUTHORIZED",
          message: "Unauthorized",
          status: 401,
        })
      : createOrpcHandler("page.list", list)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => usePages(), { wrapper });

  return { list, queryClient: wrapper.queryClient, result };
}

describe("usePages", () => {
  test("reads the store's pages, cached under the key the pages' writes drop", async () => {
    const { list, queryClient, result } = setup();

    await waitFor(() => {
      expect(result.current.data).toEqual(ROWS);
    });
    expect(list).toHaveBeenCalledOnce();
    expect(
      queryClient.getQueriesData({ queryKey: pagesKey() }).map(([, d]) => d)
    ).toEqual([ROWS]);
  });

  test("fails with the server's code, never an empty list", async () => {
    const { result } = setup({ fails: true });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({ code: "UNAUTHORIZED" });
    });
    expect(result.current.data).toBeUndefined();
  });
});
