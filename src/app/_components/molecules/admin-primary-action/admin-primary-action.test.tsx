import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { collectHydrationErrors } from "@/test/hydration";

import { AdminPrimaryAction } from "./admin-primary-action";

/** A 390 × 800 phone whose keyboard may be open, the bar laid out on it. */
function setup({ visibleHeight = 800 } = {}) {
  const viewport = Object.assign(new EventTarget(), {
    height: visibleHeight,
    offsetTop: 0,
    scale: 1,
  });
  vi.stubGlobal("visualViewport", viewport);
  // A phone's width, under md: the bar rides along the bottom.
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({ matches: false, media: query }) as unknown as MediaQueryList
  );
  vi.useFakeTimers({
    toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
  });
  // Fixed to the bottom of an 800 px layout viewport, 72 px tall, moved by
  // nothing yet: happy-dom lays nothing out.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 728, 390, 72)
  );

  render(
    <AdminPrimaryAction>
      <button type="button">Guardar</button>
    </AdminPrimaryAction>
  );
  act(() => {
    vi.advanceTimersToNextFrame();
  });

  return {
    bar: screen.getByRole("button", { name: "Guardar" }).parentElement,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminPrimaryAction", () => {
  test("holds the main action in a bar fixed along a phone's bottom, and in the top bar's row from md up", () => {
    const { bar } = setup();

    expect(bar).toHaveAttribute("data-slot", "admin-primary-action");
    expect(bar).toHaveClass(
      "fixed",
      "inset-x-0",
      "bottom-0",
      "md:static",
      "md:p-0"
    );
  });

  test("carries no shift while no keyboard is open", () => {
    const { bar } = setup();

    expect(bar).not.toHaveAttribute("data-keyboard");
    expect(bar).not.toHaveAttribute("style");
  });

  test("rides above the keyboard on a phone only, by the keyboard's height, without the home bar's room under it", () => {
    const { bar } = setup({ visibleHeight: 500 });

    expect(bar).toHaveAttribute("data-keyboard", "open");
    expect(bar?.style.getPropertyValue("--keyboard-inset")).toBe("300px");
    expect(bar).toHaveClass(
      "max-md:data-[keyboard=open]:-translate-y-(--keyboard-inset)",
      "max-md:data-[keyboard=open]:pb-3"
    );
  });

  test("hydrates the server's markup unchanged", () => {
    vi.stubGlobal(
      "visualViewport",
      Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 })
    );

    const { errors } = collectHydrationErrors(
      <AdminPrimaryAction>
        <button type="button">Guardar</button>
      </AdminPrimaryAction>,
      { clientNowMs: 1000, serverNowMs: 0 }
    );

    expect(errors).toEqual([]);
  });
});
