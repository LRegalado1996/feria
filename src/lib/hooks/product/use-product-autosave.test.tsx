import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { toProductValues } from "@/lib/catalog/product-form";
import { reportError } from "@/lib/errors/client";
import { makeProductForm } from "@/test/factories/store-product";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import {
  AUTOSAVE_DELAY_MS,
  createAutosave,
  useProductAutosave,
} from "./use-product-autosave";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});
vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

afterEach(() => {
  // Back to the document's own visibility.
  Reflect.deleteProperty(document, "visibilityState");
});

/** The article as the form holds it, told apart by its price. */
function makeValues(price: number) {
  return toProductValues(makeProductForm({ price }));
}

function savedAs(id: number) {
  return {
    id,
    publishGaps: [],
    slug: "anillo-de-plata",
    status: "draft",
    updatedAt: "2026-11-16T10:00:00.000Z",
  };
}

/**
 * The autosave over `product.create` and `product.update`, each answering
 * at once unless `holds` keeps it until `release()`, or refusing when it
 * `fails`.
 */
function setup({
  fails = [] as ("create" | "update")[],
  holds = false,
  id = null as number | null,
  // The clock moves only when the test moves it: a test about the exact
  // pause cannot let real time leak into it.
  stillClock = false,
} = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: !stillClock });
  let gate = Promise.resolve();
  let open = (): void => undefined;

  if (holds) {
    gate = new Promise<void>((resolve) => {
      open = resolve;
    });
  }

  const create = vi.fn(async (_input: unknown) => {
    await gate;
    return savedAs(12);
  });
  const update = vi.fn(async (input: unknown) => {
    await gate;
    return savedAs(
      typeof input === "object" && input !== null && "id" in input
        ? Number(input.id)
        : 0
    );
  });
  const refusal = {
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
    status: 500,
  };
  server.use(
    fails.includes("create")
      ? createOrpcErrorHandler("product.create", refusal)
      : createOrpcHandler("product.create", create),
    fails.includes("update")
      ? createOrpcErrorHandler("product.update", refusal)
      : createOrpcHandler("product.update", update)
  );
  const onCreated = vi.fn<(id: number) => void>();
  const { result, unmount } = renderHook(
    () => useProductAutosave({ id, onCreated }),
    { wrapper: createQueryWrapper() }
  );

  return {
    create,
    onCreated,
    release: () => {
      open();
    },
    result,
    unmount,
    update,
  };
}

describe("useProductAutosave", () => {
  test("creates the article with its first save, then updates it by its id", async () => {
    const { create, onCreated, result, update } = setup();

    act(() => {
      result.current.saveNow(makeValues(100));
    });

    await waitFor(() => {
      expect(result.current.id).toBe(12);
    });
    expect(create).toHaveBeenCalledExactlyOnceWith(makeValues(100));
    expect(onCreated).toHaveBeenCalledExactlyOnceWith(12);
    await waitFor(() => {
      expect(result.current.status).toBe("saved");
    });

    act(() => {
      result.current.saveNow(makeValues(200));
    });

    await waitFor(() => {
      expect(update).toHaveBeenCalledExactlyOnceWith({
        ...makeValues(200),
        id: 12,
      });
    });
    expect(create).toHaveBeenCalledOnce();
  });

  test("updates an article it was given from the first save on", async () => {
    const { create, result, update } = setup({ id: 7 });

    act(() => {
      result.current.saveNow(makeValues(100));
    });

    await waitFor(() => {
      expect(update).toHaveBeenCalledExactlyOnceWith({
        ...makeValues(100),
        id: 7,
      });
    });
    expect(create).not.toHaveBeenCalled();
    expect(result.current.id).toBe(7);
  });

  test("waits for the typing to pause before it saves, and saves only the latest", async () => {
    const { result, update } = setup({ id: 7, stillClock: true });

    act(() => {
      result.current.schedule(makeValues(100));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    });
    act(() => {
      result.current.schedule(makeValues(200));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    });

    expect(update).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    // `vi.waitFor` moves the still clock between its checks.
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledExactlyOnceWith({
        ...makeValues(200),
        id: 7,
      });
    });
  });

  test("never sends a save while one travels, and then only the latest values", async () => {
    const { create, release, result, update } = setup({ holds: true });

    act(() => {
      result.current.saveNow(makeValues(100));
    });
    await waitFor(() => {
      expect(create).toHaveBeenCalledOnce();
    });
    expect(result.current.status).toBe("saving");

    act(() => {
      result.current.saveNow(makeValues(200));
      result.current.saveNow(makeValues(300));
    });
    expect(update).not.toHaveBeenCalled();

    release();

    await waitFor(() => {
      expect(result.current.status).toBe("saved");
    });
    expect(update.mock.calls).toEqual([[{ ...makeValues(300), id: 12 }]]);
  });

  test("flush sends what waits for the pause and resolves once it is saved", async () => {
    const { result, update } = setup({ id: 7 });
    act(() => {
      result.current.schedule(makeValues(100));
    });

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.flush();
    });

    expect(outcome).toBe("saved");
    expect(update).toHaveBeenCalledExactlyOnceWith({
      ...makeValues(100),
      id: 7,
    });
  });

  test("flush with nothing ever saved sends nothing and says idle", async () => {
    const { create, result, update } = setup();

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.flush();
    });

    expect(outcome).toBe("idle");
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test.each([
    ["the first save, which creates", null, "create" as const, false],
    ["a later save, which updates", 7, "update" as const, true],
  ])(
    "a failure of %s is said, reported once and sent again on retry",
    async (_case, id, failing, created) => {
      const { result } = setup({ fails: [failing], id });

      act(() => {
        result.current.saveNow(makeValues(100));
      });

      await waitFor(() => {
        expect(result.current.status).toBe("failed");
      });
      expect(reportError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        }),
        { action: "Product.autosave", context: { created } }
      );

      const resent = vi.fn((_input: unknown) => savedAs(7));
      server.use(createOrpcHandler(`product.${failing}`, resent));
      act(() => {
        result.current.retry();
      });

      await waitFor(() => {
        expect(result.current.status).toBe("saved");
      });
      expect(resent).toHaveBeenCalledExactlyOnceWith(
        id === null ? makeValues(100) : { ...makeValues(100), id }
      );
    }
  );

  test.each([
    ["hidden, sends what waits at once", "hidden", 1],
    ["still visible, waits for the pause", "visible", 0],
  ])("a page that turns %s", async (_case, visibility, sent) => {
    const { result, update } = setup({ id: 7 });
    act(() => {
      result.current.schedule(makeValues(100));
    });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: visibility,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // A macrotask: a save sent now has reached the server by then.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS / 2);
    });
    await waitFor(() => {
      expect(update.mock.calls).toEqual(
        sent === 1 ? [[{ ...makeValues(100), id: 7 }]] : []
      );
    });
  });

  test("leaving the wizard saves what waits for the pause at once", async () => {
    const { result, unmount, update } = setup({ id: 7 });
    act(() => {
      result.current.schedule(makeValues(100));
    });

    unmount();

    await waitFor(() => {
      expect(update).toHaveBeenCalledExactlyOnceWith({
        ...makeValues(100),
        id: 7,
      });
    });
  });

  test("leaving with nothing waiting sends nothing", async () => {
    const { create, unmount } = setup();

    unmount();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(create).not.toHaveBeenCalled();
  });
});

describe("createAutosave", () => {
  test("fails a save that starts before its writers were handed in, and says so", async () => {
    const onStatus = vi.fn();
    const autosave = createAutosave({ id: 12, onId: vi.fn(), onStatus });

    autosave.saveNow(toProductValues(makeProductForm()));

    await expect(autosave.flush()).resolves.toBe("failed");
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      new Error("The autosave saved before its writers were handed in"),
      { action: "Product.autosave", context: { created: true } }
    );
  });
});
