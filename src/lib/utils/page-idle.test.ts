import { afterEach, describe, expect, test, vi } from "vitest";

import { whenPageIdle } from "./page-idle";

type ReadyState = DocumentReadyState;

/**
 * The page at `readyState`, with the browser's idle callbacks held until
 * `idle()` runs them (or absent, as in Safari).
 */
function setup({
  idleCallbacks = true,
  readyState = "complete",
}: { idleCallbacks?: boolean; readyState?: ReadyState } = {}) {
  vi.useFakeTimers();
  Object.defineProperty(document, "readyState", {
    configurable: true,
    value: readyState,
  });
  const pending = new Map<number, IdleRequestCallback>();
  let nextId = 1;
  const requestIdle = vi.fn(
    (callback: IdleRequestCallback, _options?: IdleRequestOptions) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, callback);
      return id;
    }
  );
  const cancelIdle = vi.fn((id: number) => {
    pending.delete(id);
  });

  vi.stubGlobal("requestIdleCallback", idleCallbacks ? requestIdle : undefined);
  vi.stubGlobal("cancelIdleCallback", cancelIdle);
  const callback = vi.fn<() => void>();

  return {
    callback,
    cancelIdle,
    /** Runs the idle callbacks the browser holds. */
    idle: () => {
      for (const [id, held] of pending) {
        pending.delete(id);
        held({ didTimeout: false, timeRemaining: () => 50 });
      }
    },
    load: () => {
      window.dispatchEvent(new Event("load"));
    },
    requestIdle,
  };
}

afterEach(() => {
  // The document's own ready state, given back.
  Reflect.deleteProperty(document, "readyState");
  vi.useRealTimers();
});

describe("whenPageIdle", () => {
  test("on a loaded page, waits for the browser's idle moment, with the default timeout", () => {
    const { callback, idle, requestIdle } = setup();

    whenPageIdle(callback);

    expect(requestIdle).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
      timeout: 2000,
    });
    expect(callback).not.toHaveBeenCalled();
    idle();
    expect(callback).toHaveBeenCalledExactlyOnceWith();
  });

  test("a page still loading waits for its load event before asking for an idle moment", () => {
    const { callback, idle, load, requestIdle } = setup({
      readyState: "interactive",
    });

    whenPageIdle(callback, { timeout: 750 });
    idle();

    expect(requestIdle).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    load();
    expect(requestIdle).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
      timeout: 750,
    });
    idle();
    expect(callback).toHaveBeenCalledExactlyOnceWith();
  });

  test("without idle callbacks (Safari), runs on the next turn after the load", () => {
    const { callback } = setup({ idleCallbacks: false });

    whenPageIdle(callback);

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(callback).toHaveBeenCalledExactlyOnceWith();
  });

  test.each([
    ["before the load", "loading" as const, true],
    ["while it waits for an idle moment", "complete" as const, true],
    ["while it waits for the next turn (Safari)", "complete" as const, false],
  ])("cancelled %s, never runs", (_when, readyState, idleCallbacks) => {
    const { callback, idle, load } = setup({ idleCallbacks, readyState });

    const cancel = whenPageIdle(callback);
    cancel();
    load();
    idle();
    vi.advanceTimersByTime(10_000);

    expect(callback).not.toHaveBeenCalled();
  });

  test("cancelling an idle request hands its id back to the browser", () => {
    const { callback, cancelIdle, requestIdle } = setup();

    const cancel = whenPageIdle(callback);
    cancel();

    expect(cancelIdle).toHaveBeenCalledExactlyOnceWith(
      requestIdle.mock.results[0]?.value
    );
  });
});
