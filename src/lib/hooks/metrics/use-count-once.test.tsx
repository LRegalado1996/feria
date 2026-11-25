import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useCountOnce } from "./use-count-once";

// The page's idle moment, driven by hand: each wait is kept until `idle()`
// runs it, and its cancel says whether it was dropped.
const { cancels, waits, whenPageIdle } = vi.hoisted(() => {
  const waits: (() => void)[] = [];
  const cancels: (() => void)[] = [];

  return {
    cancels,
    waits,
    whenPageIdle: vi.fn((callback: () => void) => {
      waits.push(callback);
      const cancel = vi.fn(() => undefined);
      cancels.push(cancel);

      return cancel;
    }),
  };
});

vi.mock("@/lib/utils/page-idle", () => ({ whenPageIdle }));

// Errors from storage are `use-session-flag.test.tsx`'s.
vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

afterEach(() => {
  window.sessionStorage.clear();
  waits.splice(0);
  cancels.splice(0);
});

let keys = 0;

/**
 * A key of the test's own (the session flag keeps the page load's keys in
 * memory), the hook mounted with it, a `send` that records each call and
 * the page's idle moment to run.
 */
function setup({ counted = false }: { counted?: boolean } = {}) {
  keys += 1;
  const key = `count:${String(keys)}`;

  if (counted) {
    window.sessionStorage.setItem(key, "1");
  }

  const send = vi.fn<(onCounted: () => void) => void>();
  const mounted = renderHook(
    ({ countKey }: { countKey: string }) => {
      useCountOnce(countKey, send);
    },
    { initialProps: { countKey: key } }
  );

  return {
    idle: () => {
      act(() => {
        for (const wait of waits.splice(0)) {
          wait();
        }
      });
    },
    key,
    mounted,
    /** Answers the last send as the server's success would. */
    succeed: () => {
      act(() => {
        send.mock.calls.at(-1)?.[0]();
      });
    },
    send,
  };
}

describe("useCountOnce", () => {
  test("waits for the page to be idle, then sends once and remembers the key for the session", () => {
    const { idle, key, send, succeed } = setup();

    expect(send).not.toHaveBeenCalled();

    idle();

    expect(send).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
    expect(window.sessionStorage.getItem(key)).toBeNull();

    succeed();

    expect(window.sessionStorage.getItem(key)).toBe("1");
  });

  test("sends nothing for a key the session already counted", () => {
    const { send } = setup({ counted: true });

    expect(whenPageIdle).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  test("a reload after the count sends nothing more", () => {
    const { idle, key, mounted, send, succeed } = setup();
    idle();
    succeed();
    mounted.unmount();

    renderHook(() => {
      useCountOnce(key, send);
    });
    idle();

    expect(send).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
  });

  test("a send that never succeeds is not retried while mounted, and is on the next load", () => {
    const { idle, key, mounted, send } = setup();
    idle();
    mounted.rerender({ countKey: key });
    idle();

    expect(send).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
    expect(window.sessionStorage.getItem(key)).toBeNull();

    mounted.unmount();
    renderHook(() => {
      useCountOnce(key, send);
    });
    idle();

    expect(send.mock.calls).toEqual([
      [expect.any(Function)],
      [expect.any(Function)],
    ]);
  });

  test("counts a new key on the same mount: another article", () => {
    const { idle, mounted, send, succeed } = setup();
    idle();
    succeed();

    mounted.rerender({ countKey: "count:another" });
    idle();

    expect(send.mock.calls).toEqual([
      [expect.any(Function)],
      [expect.any(Function)],
    ]);
  });

  test("leaving before the page is idle drops the wait and sends nothing", () => {
    const { mounted, send } = setup();

    mounted.unmount();

    expect(cancels.at(-1)).toHaveBeenCalledExactlyOnceWith();
    expect(send).not.toHaveBeenCalled();
  });
});
