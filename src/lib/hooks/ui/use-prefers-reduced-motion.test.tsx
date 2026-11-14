import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { stubReducedMotion } from "@/test/reduced-motion";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

function Probe() {
  return <output>{String(usePrefersReducedMotion())}</output>;
}

function setup(initial: boolean) {
  const motion = stubReducedMotion(initial);

  return { motion, mount: () => renderHook(() => usePrefersReducedMotion()) };
}

describe("usePrefersReducedMotion", () => {
  test.each([
    [true, true],
    [false, false],
  ])("reads %s from the system setting as %s", (setting, expected) => {
    const { motion, mount } = setup(setting);

    const { result } = mount();

    expect(result.current).toBe(expected);
    expect(motion.queries).toContain("(prefers-reduced-motion: reduce)");
  });

  test("assumes motion on the server, whatever the browser will say", () => {
    setup(true);

    expect(renderToString(<Probe />)).toBe("<output>false</output>");
  });

  test("follows the setting when it changes, both ways", () => {
    const { motion, mount } = setup(false);
    const { result } = mount();

    act(() => {
      motion.set(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      motion.set(false);
    });
    expect(result.current).toBe(false);
  });

  test("stops listening on unmount", () => {
    const { motion, mount } = setup(false);
    const view = mount();
    expect(motion.listenerCount()).toBe(1);

    view.unmount();

    expect(motion.listenerCount()).toBe(0);
  });
});
