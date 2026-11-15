import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { stubReducedMotion } from "@/test/reduced-motion";

import { StoreBubbles } from "./store-bubbles";

function setup({ reducedMotion = false } = {}) {
  const motion = stubReducedMotion(reducedMotion);
  const user = userEvent.setup();
  const { container } = render(
    <div data-testid="stage">
      <StoreBubbles className="custom" label="Make bubbles">
        <span data-testid="logo">LR Market</span>
      </StoreBubbles>
    </div>
  );
  const layer = () =>
    container.querySelector('[data-slot="store-bubbles-layer"]');

  return {
    bubbles: () => [
      ...container.querySelectorAll('[data-slot="store-bubble"]'),
    ],
    layer,
    motion,
    user,
  };
}

describe("StoreBubbles", () => {
  test("wraps its content in a button named by the label, 44 px tall", () => {
    setup();

    const button = screen.getByRole("button", { name: "Make bubbles" });

    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("data-slot", "store-bubbles");
    expect(button).toHaveClass("min-h-11", "custom");
    expect(button).toContainElement(screen.getByTestId("logo"));
  });

  test("blows a first burst on load: ten bubbles, decoration that takes no click and hides from a screen reader", () => {
    const { bubbles, layer } = setup();

    expect(layer()).toHaveAttribute("aria-hidden", "true");
    expect(layer()).toHaveAttribute("data-burst", "0");
    expect(layer()).toHaveClass("pointer-events-none", "overflow-hidden");
    expect(bubbles()).toHaveLength(10);
    expect(bubbles()[0]).toHaveClass("motion-safe:animate-store-bubble");
  });

  test("every bubble has its own size, drift and timing, and is gone within five seconds", () => {
    const { bubbles } = setup();
    // "72vw" and "240ms" alike: the number before the unit.
    const read = (bubble: Element, name: string) =>
      Number(
        (bubble instanceof HTMLElement ? bubble : null)?.style
          .getPropertyValue(name)
          .replace(/[a-z]+$/, "")
      );

    expect(bubbles()[3]).toHaveStyle({ height: "88px", width: "88px" });
    expect(read(bubbles()[3] ?? document.body, "--store-bubble-x")).toBe(72);
    expect(read(bubbles()[3] ?? document.body, "--store-bubble-y")).toBe(44);

    const lifetimes = bubbles().map(
      (bubble) =>
        read(bubble, "--store-bubble-delay") +
        read(bubble, "--store-bubble-duration")
    );

    expect(Math.max(...lifetimes)).toBeLessThan(5000);
    expect(Math.max(...lifetimes)).toBe(4320);
  });

  test("pressing it blows a new burst: the layer is a new element, so the animation plays again", async () => {
    const { layer, user } = setup();
    const first = layer();

    await user.click(screen.getByRole("button", { name: "Make bubbles" }));

    expect(layer()).toHaveAttribute("data-burst", "1");
    expect(layer()).not.toBe(first);

    await user.click(screen.getByRole("button", { name: "Make bubbles" }));

    expect(layer()).toHaveAttribute("data-burst", "2");
  });

  test("with reduced motion it is the content alone: no button, no bubbles", () => {
    const { bubbles, layer } = setup({ reducedMotion: true });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(layer()).not.toBeInTheDocument();
    expect(bubbles()).toHaveLength(0);
    expect(screen.getByTestId("logo").parentElement).toHaveClass("custom");
  });

  test("follows the setting when it changes while the page is open", () => {
    const { layer, motion } = setup();

    act(() => {
      motion.set(true);
    });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(layer()).not.toBeInTheDocument();

    act(() => {
      motion.set(false);
    });

    expect(
      screen.getByRole("button", { name: "Make bubbles" })
    ).toBeInTheDocument();
  });
});
