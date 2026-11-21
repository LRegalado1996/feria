import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
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

const KEY = storeAttributesKey();

const REFUSAL = "Give every value of the filter, once each";

function makeValue(id: number, position: number) {
  return {
    id,
    nameEn: null,
    nameEs: `Valor ${id}`,
    position,
    productCount: id,
    slug: `valor-${id}`,
    swatchColor: null,
  };
}

/** A filter whose values are `valueIds`, in that order. */
function makeFilter(id: number, position: number, valueIds: number[]) {
  return {
    id,
    nameEn: null,
    nameEs: `Filtro ${id}`,
    position,
    slug: `filtro-${id}`,
    values: valueIds.map((valueId, index) => makeValue(valueId, index)),
  };
}

type Filter = ReturnType<typeof makeFilter>;

/** The list with filter 7's and filter 8's values in these orders. */
function listWith(colors: number[], sizes: number[] = [81, 82]) {
  return [makeFilter(7, 0, colors), makeFilter(8, 1, sizes)];
}

const LIST = listWith([71, 72, 73]);

function move(attributeId: number, ids: number[]) {
  return { attributeId, ids };
}

interface SetupOptions {
  /** `attribute.reorderValues`'s answer: saved, refused, or never. */
  answer?: "fail" | "hang" | "save";
  /** The cached list; `null` for none yet. */
  list?: Filter[] | null;
}

function setup({ answer = "save", list = LIST }: SetupOptions = {}) {
  const reorder = vi.fn(async (input: unknown) =>
    answer === "hang" ? await new Promise<never>(() => {}) : input
  );
  server.use(
    answer === "fail"
      ? createOrpcErrorHandler("attribute.reorderValues", {
          code: "BAD_REQUEST",
          message: REFUSAL,
          status: 400,
        })
      : createOrpcHandler("attribute.reorderValues", reorder)
  );
  const wrapper = createQueryWrapper();
  const { queryClient } = wrapper;

  if (list) {
    queryClient.setQueryData(KEY, list);
  }

  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(
    () => ({
      filters: useReorderAttributes(),
      reorder: useReorderAttributeValues(),
    }),
    { wrapper }
  );

  return {
    invalidateQueries,
    listNow: () => queryClient.getQueryData(KEY),
    metas: () =>
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.meta),
    /** Each mutation's place in the store's queue, oldest first. */
    queue: () =>
      queryClient
        .getMutationCache()
        .getAll()
        .map(({ state }) => ({
          isPaused: state.isPaused,
          status: state.status,
        })),
    reorder,
    result,
    setList: (rows: Filter[]) => {
      queryClient.setQueryData(KEY, rows);
    },
  };
}

/**
 * Holds every reorder request, of values or of filters, until the test
 * answers it, in the order received.
 */
function holdReorders() {
  const received: unknown[] = [];
  const answers: ((outcome: "fail" | "save") => void)[] = [];
  const hold = (path: string) =>
    http.post<never, { json?: unknown }>(path, async ({ request }) => {
      const { json } = await request.json();
      received.push(json);
      const outcome = await new Promise<"fail" | "save">((resolve) => {
        answers.push(resolve);
      });

      return outcome === "save"
        ? HttpResponse.json({ json, meta: [] })
        : HttpResponse.json(
            {
              code: "BAD_REQUEST",
              defined: true,
              message: REFUSAL,
              status: 400,
            },
            { status: 400 }
          );
    });
  server.use(
    hold("*/api/orpc/attribute/reorderValues"),
    hold("*/api/orpc/attribute/reorder")
  );

  return {
    answer: (index: number, outcome: "fail" | "save") => {
      answers[index]?.(outcome);
    },
    received,
  };
}

const RUNNING = { isPaused: false, status: "pending" };
const QUEUED = { isPaused: true, status: "pending" };

describe("useReorderAttributeValues", () => {
  test("puts the filter's new order on screen before the server answers, leaving the other filter's values alone", async () => {
    const { listNow, reorder, result } = setup({ answer: "hang" });

    void result.current.reorder.mutateAsync(move(7, [73, 71, 72]));

    await waitFor(() => {
      expect(listNow()).toEqual(listWith([73, 71, 72]));
    });
    await waitFor(() => {
      expect(reorder).toHaveBeenCalledExactlyOnceWith(move(7, [73, 71, 72]));
    });
  });

  test("keeps the new order once saved, without reading the list again", async () => {
    const { invalidateQueries, listNow, result } = setup();

    await expect(
      result.current.reorder.mutateAsync(move(8, [82, 81]))
    ).resolves.toEqual(move(8, [82, 81]));

    expect(listNow()).toEqual(listWith([71, 72, 73], [82, 81]));
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  test("puts the previous order back when the server refuses, then reads the list again", async () => {
    const { invalidateQueries, listNow, metas, result } = setup({
      answer: "fail",
    });

    await expect(
      result.current.reorder.mutateAsync(move(7, [72, 71, 73]))
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: REFUSAL });

    expect(listNow()).toEqual(LIST);
    expect(invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: KEY,
    });
    // The screen reports the failure itself, once.
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });

  test("puts the saved order back over a list read that landed while the move was in flight, reading nothing", async () => {
    const { invalidateQueries, listNow, result, setList } = setup();
    const { answer, received } = holdReorders();

    const saved = result.current.reorder.mutateAsync(move(7, [73, 72, 71]));
    await waitFor(() => {
      expect(received).toEqual([move(7, [73, 72, 71])]);
    });
    // A list read from before the save answers with the old order.
    setList(LIST);

    answer(0, "save");
    await expect(saved).resolves.toEqual(move(7, [73, 72, 71]));

    expect(listNow()).toEqual(listWith([73, 72, 71]));
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  test("queues a second quick move until the first is answered, then sends it", async () => {
    const { queue, result } = setup();
    const { answer, received } = holdReorders();

    const first = result.current.reorder.mutateAsync(move(7, [72, 71, 73]));
    const second = result.current.reorder.mutateAsync(move(7, [72, 73, 71]));

    await waitFor(() => {
      expect(received).toEqual([move(7, [72, 71, 73])]);
    });
    await waitFor(() => {
      expect(queue()).toEqual([RUNNING, QUEUED]);
    });
    expect(received).toEqual([move(7, [72, 71, 73])]);

    answer(0, "save");
    await expect(first).resolves.toEqual(move(7, [72, 71, 73]));
    await waitFor(() => {
      expect(received).toEqual([move(7, [72, 71, 73]), move(7, [72, 73, 71])]);
    });
    answer(1, "save");
    await expect(second).resolves.toEqual(move(7, [72, 73, 71]));
  });

  test("waits for a move of the filters in flight too: both share the store's queue", async () => {
    const { queue, result } = setup();
    const { answer, received } = holdReorders();
    const filtersMove = { ids: [8, 7] };

    const filters = result.current.filters.mutateAsync(filtersMove);
    const values = result.current.reorder.mutateAsync(move(7, [72, 71, 73]));

    await waitFor(() => {
      expect(received).toEqual([filtersMove]);
    });
    await waitFor(() => {
      expect(queue()).toEqual([RUNNING, QUEUED]);
    });

    answer(0, "save");
    await expect(filters).resolves.toEqual(filtersMove);
    await waitFor(() => {
      expect(received).toEqual([filtersMove, move(7, [72, 71, 73])]);
    });
    answer(1, "save");
    await expect(values).resolves.toEqual(move(7, [72, 71, 73]));
  });

  test("ends on the second move's order when the first queued move fails and the second saves", async () => {
    const { listNow, result } = setup();
    const { answer, received } = holdReorders();

    const first = result.current.reorder.mutateAsync(move(7, [72, 71, 73]));
    // Caught where it starts: the refusal lands before it is asserted.
    const refused = first.then(
      () => null,
      (error: unknown) => error
    );
    const second = result.current.reorder.mutateAsync(move(7, [72, 73, 71]));
    await waitFor(() => {
      expect(received).toEqual([move(7, [72, 71, 73])]);
    });

    answer(0, "fail");
    expect(await refused).toMatchObject({
      code: "BAD_REQUEST",
      message: REFUSAL,
    });
    await waitFor(() => {
      expect(received).toEqual([move(7, [72, 71, 73]), move(7, [72, 73, 71])]);
    });
    answer(1, "save");
    await expect(second).resolves.toEqual(move(7, [72, 73, 71]));

    expect(listNow()).toEqual(listWith([72, 73, 71]));
  });

  test("keeps the second queued move on screen when the first one saves, before the second is answered", async () => {
    const { listNow, result } = setup();
    const { answer, received } = holdReorders();

    const first = result.current.reorder.mutateAsync(move(7, [72, 71, 73]));
    const second = result.current.reorder.mutateAsync(move(7, [72, 73, 71]));
    await waitFor(() => {
      expect(listNow()).toEqual(listWith([72, 73, 71]));
    });
    await waitFor(() => {
      expect(received).toEqual([move(7, [72, 71, 73])]);
    });

    answer(0, "save");
    await expect(first).resolves.toEqual(move(7, [72, 71, 73]));

    // The first save must not flash its own, older order back.
    expect(listNow()).toEqual(listWith([72, 73, 71]));
    await waitFor(() => {
      expect(received).toEqual([move(7, [72, 71, 73]), move(7, [72, 73, 71])]);
    });
    answer(1, "save");
    await expect(second).resolves.toEqual(move(7, [72, 73, 71]));
    expect(listNow()).toEqual(listWith([72, 73, 71]));
  });

  test("keeps each filter's latest move apart: one filter's save leaves the other's queued order", async () => {
    const { listNow, result } = setup();
    const { answer, received } = holdReorders();

    const colors = result.current.reorder.mutateAsync(move(7, [73, 72, 71]));
    const sizes = result.current.reorder.mutateAsync(move(8, [82, 81]));
    await waitFor(() => {
      expect(received).toEqual([move(7, [73, 72, 71])]);
    });

    answer(0, "save");
    await expect(colors).resolves.toEqual(move(7, [73, 72, 71]));

    expect(listNow()).toEqual(listWith([73, 72, 71], [82, 81]));
    await waitFor(() => {
      expect(received).toEqual([move(7, [73, 72, 71]), move(8, [82, 81])]);
    });
    answer(1, "save");
    await expect(sizes).resolves.toEqual(move(8, [82, 81]));
    expect(listNow()).toEqual(listWith([73, 72, 71], [82, 81]));
  });

  test("creates no list when none is cached yet", async () => {
    const { listNow, reorder, result } = setup({ list: null });

    await result.current.reorder.mutateAsync(move(7, [72, 71]));

    expect(reorder).toHaveBeenCalledExactlyOnceWith(move(7, [72, 71]));
    expect(listNow()).toBeUndefined();
  });
});
