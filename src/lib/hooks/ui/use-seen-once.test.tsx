import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { stubIntersectionObserver } from "@/test/intersection-observer";

import { useSeenOnce } from "./use-seen-once";

function Probe() {
  const [ref, seen] = useSeenOnce();

  return <div data-seen={String(seen)} ref={ref} />;
}

function setup({ intersectionObserver = true } = {}) {
  const observers = stubIntersectionObserver();

  if (!intersectionObserver) {
    vi.stubGlobal("IntersectionObserver", undefined);
  }

  const element = document.createElement("div");
  const view = renderHook(() => useSeenOnce());

  return {
    attach: () => {
      act(() => {
        view.result.current[0](element);
      });
    },
    element,
    emit: (isIntersecting: boolean) => {
      act(() => {
        observers.instances.at(-1)?.emit(isIntersecting);
      });
    },
    observers,
    seen: () => view.result.current[1],
  };
}

describe("useSeenOnce", () => {
  test("is false on the server", () => {
    stubIntersectionObserver();

    expect(renderToString(<Probe />)).toBe('<div data-seen="false"></div>');
  });

  test("watches its element and turns true, for good, once it is half on screen", () => {
    const { attach, element, emit, observers, seen } = setup();

    attach();
    expect(observers.instances.at(-1)?.observed).toEqual([element]);
    expect(observers.instances.at(-1)?.thresholds).toEqual([0.5]);
    emit(false);
    expect(seen()).toBe(false);

    emit(true);

    expect(seen()).toBe(true);
    expect(observers.instances.at(-1)?.disconnected).toBe(true);
  });

  test("counts an element already on screen when the page hydrates", () => {
    const { attach, emit, seen } = setup();

    attach();
    // The first report of a real observer, for an element in view.
    emit(true);

    expect(seen()).toBe(true);
  });

  test("stays false without IntersectionObserver", () => {
    const { attach, seen } = setup({ intersectionObserver: false });

    attach();

    expect(seen()).toBe(false);
  });
});
