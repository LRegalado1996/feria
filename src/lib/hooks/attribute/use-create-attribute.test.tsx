import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCreateAttribute } from "./use-create-attribute";
import { storeAttributesKey } from "./use-store-attributes";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = { nameEn: "Color", nameEs: "Color", storeSlug: "lr-market" };

const OUTPUT = { id: 7, position: 2, slug: "color" };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const procedure = vi.fn((_input: unknown) => OUTPUT);
  server.use(
    fails
      ? createOrpcErrorHandler("attribute.create", {
          code: "CONFLICT",
          message: "Another filter of this store already has that name",
          status: 409,
        })
      : createOrpcHandler("attribute.create", procedure)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useCreateAttribute("lr-market"), {
    wrapper,
  });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, procedure, result };
}

describe("useCreateAttribute", () => {
  test("sends both names, then reads the store's filters again", async () => {
    const { invalidateQueries, procedure, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual(OUTPUT);

    expect(procedure).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeAttributesKey("lr-market"),
    });
  });

  test("rejects a taken name with its code, still reads the list again, and leaves the report to the form", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Another filter of this store already has that name",
    });

    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeAttributesKey("lr-market"),
    });
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
