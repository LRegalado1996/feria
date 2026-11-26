import { randomUUID } from "node:crypto";

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

/**
 * A key of the test's own (the session flag and the calls in flight are
 * kept per page load), the hook mounted with it, a `send` whose every call
 * waits for the test to answer it, and the page's idle moment to run.
 */
function setup({ counted = false }: { counted?: boolean } = {}) {
  const key = `count:${randomUUID()}`;

  if (counted) {
    window.sessionStorage.setItem(key, "1");
  }

  const answers: { reject: () => void; resolve: () => void }[] = [];
  const send = vi.fn(
    async () =>
      await new Promise<void>((resolve, reject) => {
        answers.push({
          reject: () => {
            reject(new Error("offline"));
          },
          resolve,
        });
      })
  );
  const mount = (countKey = key) =>
    renderHook(
      ({ current }: { current: string }) => {
        useCountOnce(current, send);
      },
      { initialProps: { current: countKey } }
    );

  return {
    /** The server's answer to the last call: it counted, or it failed. */
    answer: async (outcome: "counted" | "failed") => {
      await act(async () => {
        const last = answers.at(-1);

        if (outcome === "counted") {
          last?.resolve();
        } else {
          last?.reject();
        }

        await Promise.resolve();
      });
    },
    idle: () => {
      act(() => {
        for (const wait of waits.splice(0)) {
          wait();
        }
      });
    },
    key,
    mount,
    send,
  };
}

describe("useCountOnce", () => {
  test("waits for the page to be idle, sends once, and remembers the key only once the server answers", async () => {
    const { answer, idle, key, mount, send } = setup();
    mount();

    expect(send).not.toHaveBeenCalled();

    idle();

    expect(send).toHaveBeenCalledExactlyOnceWith();
    expect(window.sessionStorage.getItem(key)).toBeNull();

    await answer("counted");

    expect(window.sessionStorage.getItem(key)).toBe("1");
  });

  test("sends nothing for a key the session already counted", () => {
    const { mount, send } = setup({ counted: true });
    mount();

    expect(whenPageIdle).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  test("a reload after the count sends nothing more", async () => {
    const { answer, idle, mount, send } = setup();
    const first = mount();
    idle();
    await answer("counted");
    first.unmount();

    mount();
    idle();

    expect(send).toHaveBeenCalledExactlyOnceWith();
  });

  test("remembers the key when the answer comes after the page was left", async () => {
    const { answer, idle, key, mount } = setup();
    const first = mount();
    idle();

    first.unmount();
    await answer("counted");

    expect(window.sessionStorage.getItem(key)).toBe("1");
  });

  test("a page mounted again while the first call is out sends nothing more", async () => {
    const { answer, idle, key, mount, send } = setup();
    const first = mount();
    idle();
    first.unmount();

    mount();
    idle();

    expect(send).toHaveBeenCalledExactlyOnceWith();

    await answer("counted");

    expect(window.sessionStorage.getItem(key)).toBe("1");
  });

  test("a send that fails is not retried while mounted, and is on the next load", async () => {
    const { answer, idle, key, mount, send } = setup();
    const first = mount();
    idle();
    await answer("failed");
    first.rerender({ current: key });
    idle();

    expect(send).toHaveBeenCalledExactlyOnceWith();
    expect(window.sessionStorage.getItem(key)).toBeNull();

    first.unmount();
    mount();
    idle();

    expect(send.mock.calls).toEqual([[], []]);
  });

  test("counts a new key on the same mount, another article, whatever the last one's answer", async () => {
    const { answer, idle, mount, send } = setup();
    const first = mount();
    idle();
    await answer("failed");

    first.rerender({ current: `count:${randomUUID()}` });
    idle();

    expect(send.mock.calls).toEqual([[], []]);
  });

  test("a render before the page is idle keeps the same wait", () => {
    const { key, mount } = setup();
    const first = mount();

    first.rerender({ current: key });
    first.rerender({ current: key });

    expect(whenPageIdle).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
  });

  test("leaving before the page is idle drops the wait and sends nothing", () => {
    const { mount, send } = setup();
    const first = mount();

    first.unmount();

    expect(cancels.at(-1)).toHaveBeenCalledExactlyOnceWith();
    expect(send).not.toHaveBeenCalled();
  });
});
