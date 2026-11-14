import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { stubIntersectionObserver } from "@/test/intersection-observer";

import { StoreReveal } from "./store-reveal";

function setup() {
  const observers = stubIntersectionObserver();
  render(
    <StoreReveal className="p-6" id="block">
      <p>Fresh this week</p>
    </StoreReveal>
  );
  const reveal = screen.getByText("Fresh this week").parentElement;

  return {
    emit: (isIntersecting: boolean) => {
      act(() => {
        observers.instances.at(-1)?.emit(isIntersecting);
      });
    },
    observers,
    reveal,
  };
}

describe("StoreReveal", () => {
  test("the server's markup holds the content, visible and idle", () => {
    stubIntersectionObserver();

    const html = renderToString(
      <StoreReveal>
        <p>Fresh this week</p>
      </StoreReveal>
    );

    expect(html).toContain('data-state="idle"');
    expect(html).toContain("<p>Fresh this week</p>");
  });

  test("watches itself and keeps a caller's class and attributes", () => {
    const { observers, reveal } = setup();

    expect(reveal).toHaveAttribute("data-slot", "store-reveal");
    expect(reveal).toHaveAttribute("id", "block");
    expect(reveal).toHaveClass("p-6");
    expect(observers.active()?.observed).toEqual([reveal]);
  });

  test("is held back while off screen and released when it scrolls in", () => {
    const { emit, reveal } = setup();

    emit(false);
    expect(reveal).toHaveAttribute("data-state", "pending");

    emit(true);
    expect(reveal).toHaveAttribute("data-state", "entered");
  });

  test("stays as it is when already on screen", () => {
    const { emit, reveal } = setup();

    emit(true);

    expect(reveal).toHaveAttribute("data-state", "idle");
  });

  test("hides and moves only with motion allowed, and only while pending", () => {
    const { reveal } = setup();

    expect(reveal).toHaveClass(
      "motion-safe:data-[state=pending]:opacity-0",
      "motion-safe:data-[state=pending]:translate-y-4",
      "motion-safe:transition-[opacity,transform]"
    );
  });
});
