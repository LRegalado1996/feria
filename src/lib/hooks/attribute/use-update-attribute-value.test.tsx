import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { storeAttributesKey } from "./use-store-attributes";
import { useUpdateAttributeValue } from "./use-update-attribute-value";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = {
  id: 21,
  nameEn: null,
  nameEs: "Plateado",
  storeSlug: "lr-market",
  swatchColor: null,
};

const OUTPUT = { id: 21, slug: "dorado" };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const procedure = vi.fn((_input: unknown) => OUTPUT);
  server.use(
    fails
      ? createOrpcErrorHandler("attribute.updateValue", {
          code: "NOT_FOUND",
          message: "Filter value not found",
          status: 404,
        })
      : createOrpcHandler("attribute.updateValue", procedure)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useUpdateAttributeValue("lr-market"), {
    wrapper,
  });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, procedure, result };
}

describe("useUpdateAttributeValue", () => {
  test("sends the id, both names and the swatch, then reads the store's filters again", async () => {
    const { invalidateQueries, procedure, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual(OUTPUT);

    expect(procedure).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeAttributesKey("lr-market"),
    });
  });

  test("rejects a failed save with its code, still reads the list again, and leaves the report to the form", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Filter value not found",
    });

    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeAttributesKey("lr-market"),
    });
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
