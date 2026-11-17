import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useDeleteAttribute } from "./use-delete-attribute";
import { storeAttributesKey } from "./use-store-attributes";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = { id: 7 };

const OUTPUT = { id: 7 };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const procedure = vi.fn((_input: unknown) => OUTPUT);
  server.use(
    fails
      ? createOrpcErrorHandler("attribute.delete", {
          code: "NOT_FOUND",
          message: "Filter not found",
          status: 404,
        })
      : createOrpcHandler("attribute.delete", procedure)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useDeleteAttribute(), {
    wrapper,
  });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, metas, procedure, result };
}

describe("useDeleteAttribute", () => {
  test("sends the id, then reads the store's filters again", async () => {
    const { invalidateQueries, procedure, result } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual(OUTPUT);

    expect(procedure).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeAttributesKey(),
    });
  });

  test("rejects a failed deletion with its code, still reads the list again, and leaves the report to the dialog", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Filter not found",
    });

    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeAttributesKey(),
    });
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
