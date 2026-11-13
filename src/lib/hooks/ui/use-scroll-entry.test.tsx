import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { stubIntersectionObserver } from "@/test/intersection-observer";

import { useScrollEntry } from "./use-scroll-entry";

function Probe() {
  const [ref, state] = useScrollEntry();

  return <div data-state={state} ref={ref} />;
}

function setup({ intersectionObserver = true } = {}) {
  const observers = stubIntersectionObserver();

  if (!intersectionObserver) {
    vi.stubGlobal("IntersectionObserver", undefined);
  }

  const element = document.createElement("div");
  const view = renderHook(() => useScrollEntry());

  const attach = () => {
    act(() => {
      view.result.current[0](element);
    });
  };
  const emit = (isIntersecting: boolean) => {
    act(() => {
      observers.instances.at(-1)?.emit(isIntersecting);
    });
  };

  return {
    attach,
    element,
    emit,
    observers,
    state: () => view.result.current[1],
    view,
  };
}

describe("useScrollEntry", () => {
  test("is idle on the server, so the markup is complete without JavaScript", () => {
    stubIntersectionObserver();

    expect(renderToString(<Probe />)).toBe('<div data-state="idle"></div>');
  });

  test("watches its element, ignoring the bottom tenth of the viewport", () => {
    const { attach, element, observers, state } = setup();

    attach();

    expect(state()).toBe("idle");
    expect(observers.active()?.observed).toEqual([element]);
    expect(observers.active()?.rootMargin).toBe("0px 0px -10% 0px");
  });

  test("what is off screen waits, then enters once when it scrolls in", () => {
    const { attach, emit, observers, state } = setup();
    attach();

    emit(false);
    expect(state()).toBe("pending");
    expect(observers.active()).toBeDefined();

    emit(true);
    expect(state()).toBe("entered");
    // Final: it stops watching, and leaving the viewport changes nothing.
    expect(observers.active()).toBeUndefined();

    emit(false);
    expect(state()).toBe("entered");
  });

  test("what is already on screen stays idle: it is never hidden to be shown again", () => {
    const { attach, emit, observers, state } = setup();
    attach();

    emit(true);

    expect(state()).toBe("idle");
    expect(observers.active()).toBeUndefined();
  });

  test("stops watching on unmount", () => {
    const { attach, observers, view } = setup();
    attach();
    const observer = observers.active();

    view.unmount();

    expect(observer?.disconnected).toBe(true);
  });

  test("stays idle where IntersectionObserver does not exist", () => {
    const { attach, observers, state } = setup({ intersectionObserver: false });

    expect(attach).not.toThrow();
    expect(state()).toBe("idle");
    expect(observers.instances).toEqual([]);
  });
});
