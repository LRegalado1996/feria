import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { stubIntersectionObserver } from "@/test/intersection-observer";

import { useOnScreen } from "./use-on-screen";

function Probe() {
  const [ref, onScreen] = useOnScreen();

  return <div data-on-screen={String(onScreen)} ref={ref} />;
}

function setup({ intersectionObserver = true } = {}) {
  const observers = stubIntersectionObserver();

  if (!intersectionObserver) {
    vi.stubGlobal("IntersectionObserver", undefined);
  }

  const element = document.createElement("div");
  const view = renderHook(() => useOnScreen());

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
    onScreen: () => view.result.current[1],
    view,
  };
}

describe("useOnScreen", () => {
  test("is false on the server", () => {
    stubIntersectionObserver();

    expect(renderToString(<Probe />)).toBe(
      '<div data-on-screen="false"></div>'
    );
  });

  test("follows its element onto the screen and off it again", () => {
    const { attach, element, emit, observers, onScreen } = setup();

    attach();
    expect(observers.instances.at(-1)?.observed).toEqual([element]);
    expect(onScreen()).toBe(false);

    emit(true);
    expect(onScreen()).toBe(true);

    emit(false);
    expect(onScreen()).toBe(false);
  });

  test("stops watching when it unmounts", () => {
    const { attach, observers, view } = setup();

    attach();
    view.unmount();

    expect(observers.instances.at(-1)?.disconnected).toBe(true);
  });

  test("stays false without IntersectionObserver", () => {
    const { attach, onScreen } = setup({ intersectionObserver: false });

    attach();

    expect(onScreen()).toBe(false);
  });
});
