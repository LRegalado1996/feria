import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useReorderAttributeValues } from "./use-reorder-attribute-values";
import { useReorderAttributes } from "./use-reorder-attributes";
import { storeAttributesKey } from "./use-store-attributes";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const FIRST = { attributeId: 7, ids: [22, 21], storeSlug: "lr-market" };

const SECOND = { attributeId: 7, ids: [21, 22], storeSlug: "lr-market" };

const OTHER = { ids: [8, 7], storeSlug: "lr-market" };

function setup({ fails = false }: { fails?: boolean } = {}) {
  const reorder = vi.fn((input: unknown) => input);
  server.use(
    fails
      ? createOrpcErrorHandler("attribute.reorderValues", {
          code: "BAD_REQUEST",
          message: "Give every value of the filter, once each",
          status: 400,
        })
      : createOrpcHandler("attribute.reorderValues", reorder)
  );
  const wrapper = createQueryWrapper();
  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(
    () => ({
      other: useReorderAttributes("lr-market"),
      reorder: useReorderAttributeValues("lr-market"),
    }),
    { wrapper }
  );
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  /** Every request either reorder sends is held until released, in order. */
  const holdRequests = () => {
    const received: unknown[] = [];
    const releases: (() => void)[] = [];
    const held = async (input: unknown) => {
      received.push(input);
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      return input;
    };
    server.use(
      createOrpcHandler("attribute.reorderValues", held),
      createOrpcHandler("attribute.reorder", held)
    );
    return { received, releases };
  };

  return { holdRequests, invalidateQueries, metas, reorder, result };
}

/** Time for a second request to arrive, were it sent in parallel. */
async function settle() {
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
}

describe("useReorderAttributeValues", () => {
  test("sends the new order of the values, then reads the store's filters again", async () => {
    const { invalidateQueries, reorder, result } = setup();

    await expect(result.current.reorder.mutateAsync(FIRST)).resolves.toEqual(
      FIRST
    );

    expect(reorder).toHaveBeenCalledExactlyOnceWith(FIRST);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeAttributesKey("lr-market"),
    });
  });

  test("rejects a refused order with its code, still reads the list again, and leaves the report to the screen", async () => {
    const { invalidateQueries, metas, result } = setup({ fails: true });

    await expect(
      result.current.reorder.mutateAsync(FIRST)
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Give every value of the filter, once each",
    });

    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: storeAttributesKey("lr-market"),
    });
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });

  test("sends a second quick move only once the first was answered", async () => {
    const { holdRequests, result } = setup();
    const { received, releases } = holdRequests();

    const first = result.current.reorder.mutateAsync(FIRST);
    const second = result.current.reorder.mutateAsync(SECOND);

    await waitFor(() => {
      expect(received).toEqual([FIRST]);
    });
    await settle();
    expect(received).toEqual([FIRST]);

    releases[0]?.();
    await expect(first).resolves.toEqual(FIRST);
    await waitFor(() => {
      expect(received).toEqual([FIRST, SECOND]);
    });
    releases[1]?.();
    await expect(second).resolves.toEqual(SECOND);
  });

  test("waits for a move of the filters in flight too: both share the store's queue", async () => {
    const { holdRequests, result } = setup();
    const { received, releases } = holdRequests();

    const other = result.current.other.mutateAsync(OTHER);
    const mine = result.current.reorder.mutateAsync(FIRST);

    await waitFor(() => {
      expect(received).toEqual([OTHER]);
    });
    await settle();
    expect(received).toEqual([OTHER]);

    releases[0]?.();
    await expect(other).resolves.toEqual(OTHER);
    await waitFor(() => {
      expect(received).toEqual([OTHER, FIRST]);
    });
    releases[1]?.();
    await expect(mine).resolves.toEqual(FIRST);
  });
});
