import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { storeAttributesKey, useStoreAttributes } from "./use-store-attributes";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const ROWS = [
  {
    id: 7,
    nameEn: "Color",
    nameEs: "Color",
    position: 0,
    slug: "color",
    values: [
      {
        id: 21,
        nameEn: "Gold",
        nameEs: "Dorado",
        position: 0,
        productCount: 3,
        slug: "dorado",
        swatchColor: "#d4af37",
      },
    ],
  },
  {
    id: 8,
    nameEn: null,
    nameEs: "Material",
    position: 1,
    slug: "material",
    values: [],
  },
];

function setup({ fails = false }: { fails?: boolean } = {}) {
  const list = vi.fn((_input: unknown) => ROWS);
  server.use(
    fails
      ? createOrpcErrorHandler("attribute.list", {
          code: "NOT_FOUND",
          message: "Store not found",
          status: 404,
        })
      : createOrpcHandler("attribute.list", list)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useStoreAttributes(), {
    wrapper,
  });

  return { list, queryClient: wrapper.queryClient, result };
}

describe("useStoreAttributes", () => {
  test("reads the store's filters with their values, cached under the list key", async () => {
    const { list, queryClient, result } = setup();

    await waitFor(() => {
      expect(result.current.data).toEqual(ROWS);
    });
    expect(list).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(queryClient.getQueryData(storeAttributesKey())).toEqual(ROWS);
  });

  test("keys the list under its procedure, with no store in the input", () => {
    expect(storeAttributesKey()).toEqual([
      "attribute",
      "list",
      { input: undefined },
    ]);
  });

  test("answers a refused read as an error, never as an empty list", async () => {
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
