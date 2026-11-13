import { act, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";
import { stubIntersectionObserver } from "@/test/intersection-observer";
import { stubReducedMotion } from "@/test/reduced-motion";

import { StoreCountUp } from "./store-count-up";

function setup({
  locale = "en",
  reducedMotion = false,
  value = 1280,
}: { locale?: Locale; reducedMotion?: boolean; value?: number } = {}) {
  vi.useFakeTimers();
  const motion = stubReducedMotion(reducedMotion);
  const observers = stubIntersectionObserver();
  const { container, unmount } = renderWithI18n(
    <StoreCountUp className="store-display-figure" value={value} />,
    { locale }
  );
  const root = container.querySelector('[data-slot="store-count-up"]');

  return {
    advance: (ms: number) => {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    },
    emit: (isIntersecting: boolean) => {
      act(() => {
        observers.instances.at(-1)?.emit(isIntersecting);
      });
    },
    figure: () =>
      root?.querySelector('[data-slot="store-count-up-figure"]')?.textContent,
    motion,
    root,
    unmount,
  };
}

describe("StoreCountUp", () => {
  test("the server renders the final value, for the eye and for a screen reader", () => {
    stubIntersectionObserver();
    const Wrapper = createI18nWrapper("en");

    const html = renderToString(
      <Wrapper>
        <StoreCountUp value={1280} />
      </Wrapper>
    );

    expect(html).toContain('<span class="sr-only">1,280</span>');
    expect(html).toContain(
      '<span aria-hidden="true" data-slot="store-count-up-figure">1,280</span>'
    );
  });

  test.each([
    ["en", "1,280"],
    ["es", "1.280"],
  ] as const)("in %s the figure reads %s", (locale, text) => {
    const { figure } = setup({ locale });

    expect(figure()).toBe(text);
    expect(
      screen.getByText(text, { selector: ".sr-only" })
    ).toBeInTheDocument();
  });

  test("already on screen, it shows the final value and never restarts", () => {
    const { advance, emit, figure } = setup();

    emit(true);
    advance(2000);

    expect(figure()).toBe("1,280");
  });

  test("off screen it waits at zero, then counts up to the value when it scrolls in", () => {
    const { advance, emit, figure } = setup();

    emit(false);
    expect(figure()).toBe("0");

    emit(true);
    advance(600);
    // Halfway through the 1200 ms, ease-out has covered 87.5% of the way.
    const midway = Number(figure()?.replace(",", ""));
    expect(midway).toBeGreaterThan(1000);
    expect(midway).toBeLessThan(1280);

    advance(700);
    expect(figure()).toBe("1,280");

    advance(5000);
    expect(figure()).toBe("1,280");
  });

  test("what a screen reader gets never changes while the digits run", () => {
    const { emit, root } = setup();

    emit(false);

    expect(root?.querySelector(".sr-only")?.textContent).toBe("1,280");
    expect(
      root?.querySelector('[data-slot="store-count-up-figure"]')
    ).toHaveAttribute("aria-hidden", "true");
  });

  test("under reduced motion it shows the final value off screen and on entry", () => {
    const { advance, emit, figure } = setup({ reducedMotion: true });

    emit(false);
    expect(figure()).toBe("1,280");

    emit(true);
    advance(600);
    expect(figure()).toBe("1,280");
  });

  test("cancels the frame it is waiting on when it unmounts mid-count", () => {
    const { advance, emit, unmount } = setup();
    const request = vi.spyOn(globalThis, "requestAnimationFrame");
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");
    emit(false);
    emit(true);
    advance(100);
    const pendingFrame: unknown = request.mock.results.at(-1)?.value;

    unmount();

    expect(pendingFrame).toBeTypeOf("number");
    expect(cancel).toHaveBeenCalledExactlyOnceWith(pendingFrame);
  });

  test("carries the class it is given, with aligned digits", () => {
    const { root } = setup();

    expect(root).toHaveClass("store-display-figure", "tabular-nums");
  });

  test("carries a test id when given one, and none otherwise", () => {
    const { root } = setup();
    renderWithI18n(<StoreCountUp data-testid="total" value={3} />);

    expect(root).not.toHaveAttribute("data-testid");
    expect(screen.getByTestId("total")).toHaveAttribute(
      "data-slot",
      "store-count-up"
    );
  });
});
