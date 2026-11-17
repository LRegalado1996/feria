import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCreateAttributeValue } from "./use-create-attribute-value";
import { storeAttributesKey } from "./use-store-attributes";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = {
  attributeId: 7,
  nameEn: "Gold",
  nameEs: "Dorado",
  swatchColor: "#d4af37",
};

const OUTPUT = { id: 21, position: 0, slug: "dorado" };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const procedure = vi.fn((_input: unknown) => OUTPUT);
  server.use(
    fails
      ? createOrpcErrorHandler("attribute.createValue", {
          code: "CONFLICT",
          message: "Another value of this filter already has that name",
          status: 409,
        })
      : createOrpcHandler("attribute.createValue", procedure)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useCreateAttributeValue(), {
    wrapper,
  });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, procedure, result };
}

describe("useCreateAttributeValue", () => {
  test("sends the filter, both names and the swatch, then reads the store's filters again", async () => {
    const { invalidateQueries, procedure, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual(OUTPUT);

    expect(procedure).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeAttributesKey(),
    });
  });

  test("rejects a taken name with its code, still reads the list again, and leaves the report to the form", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Another value of this filter already has that name",
    });

    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeAttributesKey(),
    });
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
