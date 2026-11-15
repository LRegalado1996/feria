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

const KEY = storeAttributesKey("lr-market");

const REFUSAL = "Give every filter of the store, once each";

function makeValue(id: number, position: number) {
  return {
    id,
    nameEn: null,
    nameEs: `Valor ${id}`,
    position,
    productCount: 0,
    slug: `valor-${id}`,
    swatchColor: null,
  };
}

function makeFilter(id: number, position: number) {
  return {
    id,
    nameEn: null,
    nameEs: `Filtro ${id}`,
    position,
    slug: `filtro-${id}`,
    values: [makeValue(id * 10, 0), makeValue(id * 10 + 1, 1)],
  };
}

type Filter = ReturnType<typeof makeFilter>;

const LIST = [makeFilter(7, 0), makeFilter(8, 1), makeFilter(9, 2)];

/** The list with the filters of `ids`, in that order. */
function listOf(ids: number[]) {
  return ids.map((id, position) => makeFilter(id, position));
}

function move(ids: number[]) {
  return { ids, storeSlug: "lr-market" };
}

interface SetupOptions {
  /** `attribute.reorder`'s answer: saved, refused, or never. */
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
      ? createOrpcErrorHandler("attribute.reorder", {
          code: "BAD_REQUEST",
          message: REFUSAL,
          status: 400,
        })
      : createOrpcHandler("attribute.reorder", reorder)
  );
  const wrapper = createQueryWrapper();
  const { queryClient } = wrapper;

  if (list) {
    queryClient.setQueryData(KEY, list);
  }

  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(
    () => ({
      reorder: useReorderAttributes("lr-market"),
      values: useReorderAttributeValues("lr-market"),
    }),
    { wrapper }
  );

  return {
    invalidateQueries,
    listNow: () => queryClient.getQueryData(KEY),
    /** Each mutation's place in the store's queue, oldest first. */
    queue: () =>
      queryClient
        .getMutationCache()
        .getAll()
        .map(({ state }) => ({
          isPaused: state.isPaused,
          status: state.status,
        })),
    metas: () =>
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.meta),
    reorder,
    result,
    setList: (rows: Filter[]) => {
      queryClient.setQueryData(KEY, rows);
    },
  };
}

/**
 * Holds every reorder request, of filters or of values, until the test
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
    hold("*/api/orpc/attribute/reorder"),
    hold("*/api/orpc/attribute/reorderValues")
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

describe("useReorderAttributes", () => {
  test("puts the new order on screen before the server answers, positions rewritten and values kept", async () => {
    const { listNow, reorder, result } = setup({ answer: "hang" });

    void result.current.reorder.mutateAsync(move([9, 7, 8]));

    await waitFor(() => {
      expect(listNow()).toEqual(listOf([9, 7, 8]));
    });
    await waitFor(() => {
      expect(reorder).toHaveBeenCalledExactlyOnceWith(move([9, 7, 8]));
    });
  });

  test("keeps the new order once saved, without reading the list again", async () => {
    const { invalidateQueries, listNow, result } = setup();

    await expect(
      result.current.reorder.mutateAsync(move([8, 7, 9]))
    ).resolves.toEqual(move([8, 7, 9]));

    expect(listNow()).toEqual(listOf([8, 7, 9]));
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  test("puts the previous order back when the server refuses, then reads the list again", async () => {
    const { invalidateQueries, listNow, metas, result } = setup({
      answer: "fail",
    });

    await expect(
      result.current.reorder.mutateAsync(move([9, 8, 7]))
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

    const saved = result.current.reorder.mutateAsync(move([9, 7, 8]));
    await waitFor(() => {
      expect(received).toEqual([move([9, 7, 8])]);
    });
    // A list read from before the save answers with the old order.
    setList(LIST);

    answer(0, "save");
    await expect(saved).resolves.toEqual(move([9, 7, 8]));

    expect(listNow()).toEqual(listOf([9, 7, 8]));
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  test("queues a second quick move until the first is answered, then sends it", async () => {
    const { queue, result } = setup();
    const { answer, received } = holdReorders();

    const first = result.current.reorder.mutateAsync(move([8, 7, 9]));
    const second = result.current.reorder.mutateAsync(move([8, 9, 7]));

    await waitFor(() => {
      expect(received).toEqual([move([8, 7, 9])]);
    });
    await waitFor(() => {
      expect(queue()).toEqual([RUNNING, QUEUED]);
    });
    expect(received).toEqual([move([8, 7, 9])]);

    answer(0, "save");
    await expect(first).resolves.toEqual(move([8, 7, 9]));
    await waitFor(() => {
      expect(received).toEqual([move([8, 7, 9]), move([8, 9, 7])]);
    });
    answer(1, "save");
    await expect(second).resolves.toEqual(move([8, 9, 7]));
  });

  test("waits for a move of a filter's values in flight too: both share the store's queue", async () => {
    const { queue, result } = setup();
    const { answer, received } = holdReorders();
    const valuesMove = {
      attributeId: 7,
      ids: [71, 70],
      storeSlug: "lr-market",
    };

    const values = result.current.values.mutateAsync(valuesMove);
    const filters = result.current.reorder.mutateAsync(move([8, 7, 9]));

    await waitFor(() => {
      expect(received).toEqual([valuesMove]);
    });
    await waitFor(() => {
      expect(queue()).toEqual([RUNNING, QUEUED]);
    });

    answer(0, "save");
    await expect(values).resolves.toEqual(valuesMove);
    await waitFor(() => {
      expect(received).toEqual([valuesMove, move([8, 7, 9])]);
    });
    answer(1, "save");
    await expect(filters).resolves.toEqual(move([8, 7, 9]));
  });

  test("ends on the second move's order when the first queued move fails and the second saves", async () => {
    const { listNow, result } = setup();
    const { answer, received } = holdReorders();

    const first = result.current.reorder.mutateAsync(move([8, 7, 9]));
    // Caught where it starts: the refusal lands before it is asserted.
    const refused = first.then(
      () => null,
      (error: unknown) => error
    );
    const second = result.current.reorder.mutateAsync(move([8, 9, 7]));
    await waitFor(() => {
      expect(received).toEqual([move([8, 7, 9])]);
    });

    answer(0, "fail");
    expect(await refused).toMatchObject({
      code: "BAD_REQUEST",
      message: REFUSAL,
    });
    await waitFor(() => {
      expect(received).toEqual([move([8, 7, 9]), move([8, 9, 7])]);
    });
    answer(1, "save");
    await expect(second).resolves.toEqual(move([8, 9, 7]));

    expect(listNow()).toEqual(listOf([8, 9, 7]));
  });

  test("keeps the second queued move on screen when the first one saves, before the second is answered", async () => {
    const { listNow, result } = setup();
    const { answer, received } = holdReorders();

    const first = result.current.reorder.mutateAsync(move([8, 7, 9]));
    const second = result.current.reorder.mutateAsync(move([8, 9, 7]));
    await waitFor(() => {
      expect(listNow()).toEqual(listOf([8, 9, 7]));
    });
    await waitFor(() => {
      expect(received).toEqual([move([8, 7, 9])]);
    });

    answer(0, "save");
    await expect(first).resolves.toEqual(move([8, 7, 9]));

    // The first save must not flash its own, older order back.
    expect(listNow()).toEqual(listOf([8, 9, 7]));
    await waitFor(() => {
      expect(received).toEqual([move([8, 7, 9]), move([8, 9, 7])]);
    });
    answer(1, "save");
    await expect(second).resolves.toEqual(move([8, 9, 7]));
    expect(listNow()).toEqual(listOf([8, 9, 7]));
  });

  test("creates no list when none is cached yet", async () => {
    const { listNow, reorder, result } = setup({ list: null });

    await result.current.reorder.mutateAsync(move([7, 8]));

    expect(reorder).toHaveBeenCalledExactlyOnceWith(move([7, 8]));
    expect(listNow()).toBeUndefined();
  });
});
