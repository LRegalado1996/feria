import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useReorderCategories } from "./use-reorder-categories";
import { storeCategoriesKey } from "./use-store-categories";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const KEY = storeCategoriesKey("lr-market");

function makeRow(id: number, position: number) {
  return {
    id,
    nameEn: null,
    nameEs: `Categoría ${id}`,
    position,
    productCount: id,
    slug: `categoria-${id}`,
  };
}

const LIST = [makeRow(1, 0), makeRow(2, 1), makeRow(3, 2)];

interface SetupOptions {
  /** `category.reorder`'s answer: saved, refused, or never. */
  answer?: "fail" | "hang" | "save";
  /** The cached list; `null` for none yet. */
  list?: ReturnType<typeof makeRow>[] | null;
}

function setup({ answer = "save", list = LIST }: SetupOptions = {}) {
  const reorder = vi.fn(async (input: unknown) =>
    answer === "hang"
      ? await new Promise<never>(() => {})
      : { ids: (input as { ids: number[] }).ids }
  );
  server.use(
    answer === "fail"
      ? createOrpcErrorHandler("category.reorder", {
          code: "BAD_REQUEST",
          message: "Give every category of the store, once each",
          status: 400,
        })
      : createOrpcHandler("category.reorder", reorder)
  );
  const wrapper = createQueryWrapper();

  if (list) {
    wrapper.queryClient.setQueryData(KEY, list);
  }

  const invalidateQueries = vi.spyOn(wrapper.queryClient, "invalidateQueries");
  const { result } = renderHook(() => useReorderCategories("lr-market"), {
    wrapper,
  });
  const listNow = () => wrapper.queryClient.getQueryData(KEY);
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { invalidateQueries, listNow, metas, reorder, result };
}

describe("useReorderCategories", () => {
  test("puts the new order on screen before the server answers, positions rewritten", async () => {
    const { listNow, reorder, result } = setup({ answer: "hang" });

    void result.current.mutateAsync({ ids: [3, 1, 2], storeSlug: "lr-market" });

    await waitFor(() => {
      expect(listNow()).toEqual([makeRow(3, 0), makeRow(1, 1), makeRow(2, 2)]);
    });
    // The request starts after the optimistic update: wait for it on its own.
    await waitFor(() => {
      expect(reorder).toHaveBeenCalledExactlyOnceWith({
        ids: [3, 1, 2],
        storeSlug: "lr-market",
      });
    });
  });

  test("leaves out an id the list does not hold, numbering the rest without a gap", async () => {
    const { listNow, result } = setup({ answer: "hang" });

    void result.current.mutateAsync({
      ids: [2, 9, 1, 3],
      storeSlug: "lr-market",
    });

    await waitFor(() => {
      expect(listNow()).toEqual([makeRow(2, 0), makeRow(1, 1), makeRow(3, 2)]);
    });
  });

  test("keeps the new order once saved, without reading the list again", async () => {
    const { invalidateQueries, listNow, result } = setup();

    await expect(
      result.current.mutateAsync({ ids: [2, 1, 3], storeSlug: "lr-market" })
    ).resolves.toEqual({ ids: [2, 1, 3] });

    expect(listNow()).toEqual([makeRow(2, 0), makeRow(1, 1), makeRow(3, 2)]);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  test("puts the previous order back when the server refuses, then reads the list again", async () => {
    const { invalidateQueries, listNow, result } = setup({ answer: "fail" });

    await expect(
      result.current.mutateAsync({ ids: [3, 2, 1], storeSlug: "lr-market" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Give every category of the store, once each",
    });

    expect(listNow()).toEqual(LIST);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: KEY,
    });
  });

  test("leaves reporting a failure to the screen, so it is reported once", async () => {
    const { metas, result } = setup({ answer: "fail" });

    await expect(
      result.current.mutateAsync({ ids: [3, 2, 1], storeSlug: "lr-market" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });

  test("sends a second quick move only once the first was answered", async () => {
    const { result } = setup();
    const received: unknown[] = [];
    const releases: (() => void)[] = [];
    server.use(
      createOrpcHandler("category.reorder", async (input) => {
        received.push(input);
        await new Promise<void>((resolve) => {
          releases.push(resolve);
        });
        return { ids: (input as { ids: number[] }).ids };
      })
    );

    const first = result.current.mutateAsync({
      ids: [2, 1, 3],
      storeSlug: "lr-market",
    });
    const second = result.current.mutateAsync({
      ids: [2, 3, 1],
      storeSlug: "lr-market",
    });

    await waitFor(() => {
      expect(received).toEqual([{ ids: [2, 1, 3], storeSlug: "lr-market" }]);
    });
    // Time for a second request to arrive, were it sent in parallel.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(received).toEqual([{ ids: [2, 1, 3], storeSlug: "lr-market" }]);

    releases[0]?.();
    await expect(first).resolves.toEqual({ ids: [2, 1, 3] });
    await waitFor(() => {
      expect(received).toEqual([
        { ids: [2, 1, 3], storeSlug: "lr-market" },
        { ids: [2, 3, 1], storeSlug: "lr-market" },
      ]);
    });
    releases[1]?.();
    await expect(second).resolves.toEqual({ ids: [2, 3, 1] });
  });

  test("creates no list when none is cached yet", async () => {
    const { listNow, reorder, result } = setup({ list: null });

    await result.current.mutateAsync({ ids: [1, 2], storeSlug: "lr-market" });

    expect(reorder).toHaveBeenCalledExactlyOnceWith({
      ids: [1, 2],
      storeSlug: "lr-market",
    });
    expect(listNow()).toBeUndefined();
  });
});
