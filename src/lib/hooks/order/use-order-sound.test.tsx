import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";

import { ORDER_SOUND_STORAGE_KEY, useOrderSound } from "./use-order-sound";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

afterEach(() => {
  Reflect.deleteProperty(navigator, "userActivation");
  window.localStorage.clear();
  vi.restoreAllMocks();
});

/**
 * `navigator.userActivation`, which happy-dom lacks: whether the page has
 * had a tap or a key since it loaded. Removed after each test.
 */
function stubUserActivation(hasBeenActive: boolean) {
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: { hasBeenActive },
  });
}

/**
 * A Web Audio double that records the tones it was asked to play, as
 * `[frequency, start, stop]`, and each oscillator start with the context's
 * state at that moment.
 */
function stubAudio({
  closeFails = false,
  constructFails = false,
  createFails = false,
  resumeFails = false,
  state = "running",
}: {
  closeFails?: boolean;
  constructFails?: boolean;
  createFails?: boolean;
  resumeFails?: boolean;
  state?: AudioContextState;
} = {}) {
  const tones: [number, number, number][] = [];
  const started: AudioContextState[] = [];
  const contexts: { closed: number; resumed: number }[] = [];

  class FakeAudioContext {
    currentTime = 2;
    destination = {};
    readonly record = { closed: 0, resumed: 0 };
    state = state;

    constructor() {
      if (constructFails) {
        throw new DOMException("too many contexts", "NotSupportedError");
      }

      contexts.push(this.record);
    }

    async close() {
      this.record.closed += 1;

      if (closeFails) {
        throw new Error("could not close");
      }

      this.state = "closed";
      await Promise.resolve();
    }

    createGain() {
      return {
        connect: (next: unknown) => next,
        gain: {
          exponentialRampToValueAtTime: vi.fn(),
          setValueAtTime: vi.fn(),
        },
      };
    }

    createOscillator() {
      if (createFails) {
        throw new Error("audio graph unavailable");
      }

      const tone = { frequency: { value: 0 }, start: 0 };

      return {
        connect: (next: unknown) => next,
        frequency: tone.frequency,
        start: (at: number) => {
          started.push(this.state);
          tone.start = at;
        },
        stop: (at: number) => {
          tones.push([tone.frequency.value, tone.start, at]);
        },
      };
    }

    async resume() {
      this.record.resumed += 1;

      if (resumeFails) {
        throw new Error("not allowed to start");
      }

      // As a browser does: the state changes once the promise settles.
      await Promise.resolve();
      this.state = "running";
    }
  }

  vi.stubGlobal("AudioContext", FakeAudioContext);

  return { contexts, started, tones };
}

function setup({
  audio = "present",
  stored,
  storage = "works",
}: {
  audio?:
    | "missing"
    | "present"
    | "suspended"
    | "suspended-refused"
    | "broken"
    | "refused"
    | "unclosable";
  stored?: string;
  storage?: "read-fails" | "works" | "write-fails";
} = {}) {
  if (stored !== undefined) {
    window.localStorage.setItem(ORDER_SOUND_STORAGE_KEY, stored);
  }

  if (storage !== "works") {
    const real = window.localStorage;
    const refusing: Storage = {
      clear: () => {
        real.clear();
      },
      getItem: (key: string) => {
        if (storage === "read-fails") {
          throw new DOMException("blocked", "SecurityError");
        }

        return real.getItem(key);
      },
      key: (index: number) => real.key(index),
      get length() {
        return real.length;
      },
      removeItem: (key: string) => {
        real.removeItem(key);
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    vi.spyOn(window, "localStorage", "get").mockReturnValue(refusing);
  }

  const recorded =
    audio === "missing"
      ? (vi.stubGlobal("AudioContext", undefined),
        { contexts: [], started: [], tones: [] })
      : stubAudio({
          closeFails: audio === "unclosable",
          constructFails: audio === "refused",
          createFails: audio === "broken",
          resumeFails: audio === "suspended-refused",
          state: audio.startsWith("suspended") ? "suspended" : "running",
        });
  const { result, unmount } = renderHook(() => useOrderSound());

  return {
    ...recorded,
    /** A tap or a key anywhere on the page. */
    gesture: async (
      type: "keydown" | "pointerdown" | "pointerup" = "pointerdown"
    ) => {
      await act(async () => {
        document.body.dispatchEvent(new Event(type, { bubbles: true }));
        await Promise.resolve();
      });
    },
    result,
    unmount,
    stored: () => window.localStorage.getItem(ORDER_SOUND_STORAGE_KEY),
  };
}

const BEEP: [number, number, number] = [880, 2, 2.18];

describe("useOrderSound", () => {
  test.each([
    [undefined, false],
    ["off", false],
    ["on", true],
    ["yes", false],
  ])("with %j remembered, the sound is on: %s", (stored, expected) => {
    const { result } = setup({ stored });

    expect(result.current.enabled).toBe(expected);
  });

  test("is unknown on the server, so the browser's choice never changes the first render", () => {
    window.localStorage.setItem(ORDER_SOUND_STORAGE_KEY, "on");

    function Probe() {
      return <p>{String(useOrderSound().enabled)}</p>;
    }

    expect(renderToString(<Probe />)).toBe("<p>null</p>");
  });

  test("turning it on remembers it and beeps once, inside the tap", () => {
    const { result, stored, tones } = setup();

    act(() => {
      result.current.setEnabled(true);
    });

    expect(result.current.enabled).toBe(true);
    expect(stored()).toBe("on");
    expect(tones).toEqual([BEEP]);
  });

  test("turning it off remembers it, silently", () => {
    const { result, stored, tones } = setup({ stored: "on" });

    act(() => {
      result.current.setEnabled(false);
    });

    expect(result.current.enabled).toBe(false);
    expect(stored()).toBe("off");
    expect(tones).toEqual([]);
  });

  test.each([
    ["on", [BEEP]],
    ["off", []],
  ])("with the sound %s, an arrival beeps %j", (stored, expected) => {
    const { result, tones } = setup({ stored });

    act(() => {
      result.current.play();
    });

    expect(tones).toEqual(expected);
  });

  test("keeps one audio context for the page, however many beeps", () => {
    const { contexts, result, tones } = setup({ stored: "on" });

    act(() => {
      result.current.play();
      result.current.play();
    });

    expect(tones).toEqual([BEEP, BEEP]);
    expect(contexts).toEqual([{ closed: 0, resumed: 0 }]);
  });

  test("an arrival on a context the browser started suspended wakes it, without a tone", () => {
    const { contexts, result, started } = setup({
      audio: "suspended",
      stored: "on",
    });

    act(() => {
      result.current.play();
    });

    expect(contexts).toEqual([{ closed: 0, resumed: 1 }]);
    expect(started).toEqual([]);
    expect(reportError).not.toHaveBeenCalled();
  });

  test("an arrival before the first gesture is dropped, not played once the sound wakes", async () => {
    const { contexts, gesture, result, started, tones } = setup({
      audio: "suspended",
      stored: "on",
    });

    act(() => {
      result.current.play();
    });
    await gesture();

    // Woken twice, by the arrival and by the gesture: running, and silent.
    expect(contexts).toEqual([{ closed: 0, resumed: 2 }]);
    expect(result.current.needsGesture).toBe(false);
    expect(started).toEqual([]);
    expect(tones).toEqual([]);
  });

  test("once the gesture woke the sound, the next arrival beeps", async () => {
    const { gesture, result, started, tones } = setup({
      audio: "suspended",
      stored: "on",
    });

    await gesture();
    act(() => {
      result.current.play();
    });

    expect(started).toEqual(["running"]);
    expect(tones).toEqual([BEEP]);
  });

  test("turning it on in a tap on a suspended context still beeps once", () => {
    const { result, started } = setup({ audio: "suspended" });

    act(() => {
      result.current.setEnabled(true);
    });

    expect(started).toEqual(["suspended"]);
  });

  test("reports a context the browser will not wake, without failing", async () => {
    const { result, tones } = setup({
      audio: "suspended-refused",
      stored: "on",
    });

    await act(async () => {
      result.current.play();
      await Promise.resolve();
    });

    expect(tones).toEqual([]);
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "not allowed to start" }),
      { action: "Orders.resume_sound" }
    );
  });

  test("without Web Audio, turning it on still remembers it and nothing fails", () => {
    const { result, stored } = setup({ audio: "missing" });

    act(() => {
      result.current.setEnabled(true);
      result.current.play();
    });

    expect(result.current.enabled).toBe(true);
    expect(stored()).toBe("on");
    expect(reportError).not.toHaveBeenCalled();
  });

  test("reports a beep that fails, and carries on", () => {
    const { result } = setup({ audio: "broken" });

    act(() => {
      result.current.setEnabled(true);
    });

    expect(result.current.enabled).toBe(true);
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "audio graph unavailable" }),
      { action: "Orders.play_sound" }
    );
  });

  test("when storage refuses to be read, reports it once and keeps the choice in the page", () => {
    const { result } = setup({ storage: "read-fails", stored: "on" });

    expect(result.current.enabled).toBe(false);

    act(() => {
      result.current.setEnabled(true);
    });

    expect(result.current.enabled).toBe(true);
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "SecurityError" }),
      { action: "Orders.read_sound_preference" }
    );
  });

  test("when storage refuses the choice, reports it once and keeps it in the page", () => {
    const { result } = setup({ storage: "write-fails" });

    act(() => {
      result.current.setEnabled(true);
    });

    expect(result.current.enabled).toBe(true);

    act(() => {
      result.current.setEnabled(false);
    });

    expect(result.current.enabled).toBe(false);
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "QuotaExceededError" }),
      { action: "Orders.save_sound_preference" }
    );
  });

  test.each(["pointerdown", "pointerup", "keydown"] as const)(
    "a choice remembered as on waits for a gesture, and %s wakes the sound without a beep",
    async (type) => {
      const { contexts, gesture, result, tones } = setup({
        audio: "suspended",
        stored: "on",
      });
      expect(result.current.needsGesture).toBe(true);
      expect(contexts).toEqual([]);

      await gesture(type);

      expect(contexts).toEqual([{ closed: 0, resumed: 1 }]);
      expect(result.current.needsGesture).toBe(false);
      expect(tones).toEqual([]);

      await gesture(type);

      expect(contexts).toEqual([{ closed: 0, resumed: 1 }]);
    }
  );

  test("a wake the browser refuses is reported, and the next gesture tries again", async () => {
    const { contexts, gesture, result } = setup({
      audio: "suspended-refused",
      stored: "on",
    });

    await gesture();
    await gesture();

    expect(contexts).toEqual([{ closed: 0, resumed: 2 }]);
    expect(result.current.needsGesture).toBe(true);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "not allowed to start" }),
      { action: "Orders.resume_sound" }
    );
  });

  test("stops listening once the screen is gone", async () => {
    const { contexts, gesture, unmount } = setup({
      audio: "suspended",
      stored: "on",
    });

    unmount();
    await gesture();

    expect(contexts).toEqual([]);
  });

  test.each([
    ["off", "suspended"],
    [undefined, "suspended"],
    ["on", "missing"],
  ] as const)(
    "with %j remembered and audio %s, waits for no gesture",
    async (stored, audio) => {
      const { contexts, gesture, result } = setup({ audio, stored });

      expect(result.current.needsGesture).toBe(false);

      await gesture();

      expect(contexts).toEqual([]);
    }
  );

  test("turning it on in a tap wakes the sound: no gesture asked after", async () => {
    const { contexts, result } = setup({ audio: "suspended" });

    await act(async () => {
      result.current.setEnabled(true);
      await Promise.resolve();
    });

    expect(contexts).toEqual([{ closed: 0, resumed: 1 }]);
    expect(result.current.needsGesture).toBe(false);
  });

  test("on a page already touched, wakes the sound at once", async () => {
    stubUserActivation(true);
    const { contexts, result } = setup({ audio: "suspended", stored: "on" });

    await act(async () => {
      await Promise.resolve();
    });

    expect(contexts).toEqual([{ closed: 0, resumed: 1 }]);
    expect(result.current.needsGesture).toBe(false);
  });

  test("on a page not touched yet, waits for the gesture", () => {
    stubUserActivation(false);
    const { contexts, result } = setup({ audio: "suspended", stored: "on" });

    expect(contexts).toEqual([]);
    expect(result.current.needsGesture).toBe(true);
  });

  test("closes its context once the screen is gone", async () => {
    const { contexts, result, unmount } = setup({ stored: "on" });
    act(() => {
      result.current.play();
    });

    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(contexts).toEqual([{ closed: 1, resumed: 0 }]);
    expect(reportError).not.toHaveBeenCalled();
  });

  test("reports a context that will not close, without failing", async () => {
    const { contexts, result, unmount } = setup({
      audio: "unclosable",
      stored: "on",
    });
    act(() => {
      result.current.play();
    });

    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(contexts).toEqual([{ closed: 1, resumed: 0 }]);
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "could not close" }),
      { action: "Orders.close_audio" }
    );
  });

  test("a wake still on its way when the screen goes ends quietly", async () => {
    const { contexts, result, unmount } = setup({
      audio: "suspended-refused",
      stored: "on",
    });

    // The refusal lands after the screen closed the context.
    await act(async () => {
      result.current.play();
      unmount();
      await Promise.resolve();
    });

    expect(contexts).toEqual([{ closed: 1, resumed: 1 }]);
    expect(reportError).not.toHaveBeenCalled();
  });

  test("with no context to open, reports it once and stays silent, asking for no tap", async () => {
    const { gesture, result } = setup({ audio: "refused" });

    act(() => {
      result.current.setEnabled(true);
    });
    act(() => {
      result.current.play();
    });
    await gesture();

    expect(result.current.enabled).toBe(true);
    expect(result.current.needsGesture).toBe(false);
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "NotSupportedError" }),
      { action: "Orders.create_audio" }
    );
  });

  test("with no context to open on a page already touched, mounts without failing", async () => {
    stubUserActivation(true);
    const { result } = setup({ audio: "refused", stored: "on" });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.enabled).toBe(true);
    expect(result.current.needsGesture).toBe(false);
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "NotSupportedError" }),
      { action: "Orders.create_audio" }
    );
  });

  test("follows a choice made in another tab", () => {
    const { result } = setup();

    act(() => {
      window.localStorage.setItem(ORDER_SOUND_STORAGE_KEY, "on");
      window.dispatchEvent(
        new StorageEvent("storage", { key: ORDER_SOUND_STORAGE_KEY })
      );
    });

    expect(result.current.enabled).toBe(true);
  });
});
