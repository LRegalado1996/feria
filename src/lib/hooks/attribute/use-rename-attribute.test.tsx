import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useRenameAttribute } from "./use-rename-attribute";
import { storeAttributesKey } from "./use-store-attributes";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = {
  id: 7,
  nameEn: null,
  nameEs: "Material",
  storeSlug: "lr-market",
};

const OUTPUT = { id: 7, slug: "color" };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const procedure = vi.fn((_input: unknown) => OUTPUT);
  server.use(
    fails
      ? createOrpcErrorHandler("attribute.rename", {
          code: "NOT_FOUND",
          message: "Filter not found",
          status: 404,
        })
      : createOrpcHandler("attribute.rename", procedure)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useRenameAttribute("lr-market"), {
    wrapper,
  });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, procedure, result };
}

describe("useRenameAttribute", () => {
  test("sends the id and both names, then reads the store's filters again", async () => {
    const { invalidateQueries, procedure, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual(OUTPUT);

    expect(procedure).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeAttributesKey("lr-market"),
    });
  });

  test("rejects a failed rename with its code, still reads the list again, and leaves the report to the form", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Filter not found",
    });

    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeAttributesKey("lr-market"),
    });
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
