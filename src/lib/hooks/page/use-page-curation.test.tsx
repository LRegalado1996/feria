import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { orpc } from "@/lib/orpc/client";
import { makeHomeCuration } from "@/test/factories/home-curation";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { pageCurationKey, usePageCuration } from "./use-page-curation";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

function setup({ fails = false }: { fails?: boolean } = {}) {
  const curation = makeHomeCuration({ rankingProductIds: [21] });
  const get = vi.fn((_input: unknown) => curation);
  server.use(
    fails
      ? createOrpcErrorHandler("page.get", {
          code: "UNAUTHORIZED",
          message: "Unauthorized",
          status: 401,
        })
      : createOrpcHandler("page.get", get)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => usePageCuration(1), { wrapper });

  return { curation, get, queryClient: wrapper.queryClient, result };
}

describe("usePageCuration", () => {
  test("reads the page's curation, cached under the key every page's writes drop", async () => {
    const { curation, get, queryClient, result } = setup();
    // Another page's editor, and another screen's query.
    const other = makeHomeCuration({ rankingProductIds: [22] });
    queryClient.setQueryData(
      orpc.page.get.queryOptions({ input: { pageId: 2 } }).queryKey,
      other
    );
    queryClient.setQueryData(["catalog", "list", { input: {} }], []);

    await waitFor(() => {
      expect(result.current.data).toEqual(curation);
    });
    expect(get).toHaveBeenCalledExactlyOnceWith({ pageId: 1 });
    // The writes' key reaches both pages' curation, and only that.
    expect(
      queryClient
        .getQueriesData({ queryKey: pageCurationKey() })
        .map(([, data]) => data)
    ).toEqual([curation, other]);
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
