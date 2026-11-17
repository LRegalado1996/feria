import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import useEmblaCarousel from "embla-carousel-react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createFakeEmbla } from "@/test/embla";
import { renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
  WHEEL_LINE_PX,
  WHEEL_REST_MS,
  WHEEL_STEP_PX,
} from "./carousel";

vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
});

/** Prints where the carousel is, and moves it, as a control would. */
function Probe() {
  const carousel = useCarousel();

  return (
    <div>
      <output data-testid="position">
        {carousel.selectedIndex}/{carousel.snapCount}{" "}
        {carousel.canScrollPrev ? "prev" : "-"}{" "}
        {carousel.canScrollNext ? "next" : "-"}
      </output>
      <button
        onClick={() => {
          carousel.scrollPrev();
        }}
        type="button"
      >
        back
      </button>
      <button
        onClick={() => {
          carousel.scrollNext();
        }}
        type="button"
      >
        forward
      </button>
      <button
        onClick={() => {
          carousel.scrollTo(2);
        }}
        type="button"
      >
        third
      </button>
    </div>
  );
}

function setup({
  api = true,
  locale = "en",
  reduced = false,
  snaps = 3,
}: {
  api?: boolean;
  locale?: "en" | "es";
  reduced?: boolean;
  snaps?: number;
} = {}) {
  const motion = stubReducedMotion(reduced);
  const embla = createFakeEmbla({ snaps });
  vi.mocked(useEmblaCarousel).mockReturnValue(
    api ? embla.hook : [embla.ref, undefined]
  );
  const user = userEvent.setup();
  const view = renderWithI18n(
    <Carousel
      aria-label="Just arrived"
      className="mt-4"
      opts={{ align: "start" }}
    >
      <CarouselContent className="-ml-3">
        {["a", "b", "c"].map((id, index) => (
          <CarouselItem
            className="basis-1/3 pl-3"
            index={index}
            key={id}
            total={3}
          >
            <a href={`#${id}`}>{id}</a>
          </CarouselItem>
        ))}
      </CarouselContent>
      <Probe />
    </Carousel>,
    { locale }
  );

  return {
    embla,
    motion,
    position: () => screen.getByTestId("position").textContent,
    region: screen.getByRole("region", { name: "Just arrived" }),
    user,
    view,
  };
}

/**
 * A wheel event on the window the slides move in, in pixels unless the
 * wheel counts in lines or pages (`deltaMode`).
 */
function wheel(
  target: HTMLElement,
  deltaX: number,
  deltaY = 0,
  deltaMode: number = WheelEvent.DOM_DELTA_PIXEL
) {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaMode,
    deltaX,
    deltaY,
  });
  target.dispatchEvent(event);

  return event;
}

describe("Carousel", () => {
  test.each([
    ["en", "carousel", "slide", "2 of 3"],
    ["es", "carrusel", "diapositiva", "2 de 3"],
  ] as const)(
    "in %s is a named region described as a %s, its slides as a %s named %j",
    (locale, carousel, slide, second) => {
      const { region } = setup({ locale });

      expect(region).toHaveAttribute("aria-roledescription", carousel);
      expect(region).toHaveAttribute("data-slot", "carousel");
      expect(region).toHaveClass("relative", "mt-4");
      const slides = screen.getAllByRole("group");
      expect(slides).toHaveLength(3);
      expect(slides[1]).toHaveAttribute("aria-roledescription", slide);
      expect(slides[1]).toHaveAccessibleName(second);
      expect(slides[1]).toHaveClass("min-w-0", "shrink-0", "basis-1/3", "pl-3");
      expect(slides[1]).not.toHaveClass("basis-full", "pl-4");
    }
  );

  test("hands Embla its options and the viewport, and lays the track out as a row", () => {
    const { embla } = setup();

    expect(useEmblaCarousel).toHaveBeenCalledWith(
      { align: "start" },
      undefined
    );
    const viewport = document.querySelector('[data-slot="carousel-content"]');
    expect(viewport).toHaveClass("overflow-hidden");
    expect(embla.ref).toHaveBeenCalledWith(viewport);
    const track = document.querySelector('[data-slot="carousel-track"]');
    expect(track).toHaveClass("flex", "-ml-3", "touch-pan-y");
    expect(track).not.toHaveClass("-ml-4");
  });

  test("reads where Embla rests and follows it as it moves", async () => {
    const { position, user } = setup();

    expect(position()).toBe("0/3 - next");

    await user.click(screen.getByRole("button", { name: "forward" }));
    expect(position()).toBe("1/3 prev next");

    await user.click(screen.getByRole("button", { name: "third" }));
    expect(position()).toBe("2/3 prev -");

    await user.click(screen.getByRole("button", { name: "back" }));
    expect(position()).toBe("1/3 prev next");
  });

  test("measures again when Embla does, after a resize", () => {
    const { embla, position } = setup();

    act(() => {
      embla.resize(1);
    });

    expect(position()).toBe("0/1 - -");
  });

  test("glides when asked to move, and jumps under reduced motion", async () => {
    const glide = setup();
    await glide.user.click(screen.getByRole("button", { name: "forward" }));
    expect(glide.embla.fake.scrollNext).toHaveBeenCalledExactlyOnceWith(false);
    glide.view.unmount();

    const jump = setup({ reduced: true });
    await jump.user.click(screen.getByRole("button", { name: "forward" }));
    await jump.user.click(screen.getByRole("button", { name: "back" }));
    await jump.user.click(screen.getByRole("button", { name: "third" }));

    expect(jump.embla.fake.scrollNext).toHaveBeenCalledExactlyOnceWith(true);
    expect(jump.embla.fake.scrollPrev).toHaveBeenCalledExactlyOnceWith(true);
    expect(jump.embla.fake.scrollTo).toHaveBeenCalledExactlyOnceWith(2, true);
  });

  test("the arrow keys step through it while focus is inside, and other keys pass", async () => {
    const { embla, position, user } = setup();
    screen.getByRole("link", { name: "a" }).focus();

    await user.keyboard("{ArrowRight}");
    expect(position()).toBe("1/3 prev next");

    await user.keyboard("{ArrowLeft}");
    expect(position()).toBe("0/3 - next");

    await user.keyboard("{ArrowDown}");
    expect(embla.fake.scrollNext).toHaveBeenCalledOnce();
    expect(embla.fake.scrollPrev).toHaveBeenCalledOnce();
  });

  test("an arrow key's own action is taken over: the page does not scroll", () => {
    const { region } = setup();

    const right = fireEvent.keyDown(region, { key: "ArrowRight" });
    const left = fireEvent.keyDown(region, { key: "ArrowLeft" });
    const down = fireEvent.keyDown(region, { key: "ArrowDown" });

    expect(right).toBe(false);
    expect(left).toBe(false);
    expect(down).toBe(true);
  });

  test("a sideways trackpad swipe moves one step, however long it lasts", () => {
    vi.useFakeTimers();
    const { embla } = setup();

    const first = wheel(embla.root, WHEEL_STEP_PX / 2);
    expect(first.defaultPrevented).toBe(true);
    expect(embla.fake.scrollNext).not.toHaveBeenCalled();

    wheel(embla.root, WHEEL_STEP_PX / 2);
    expect(embla.fake.scrollNext).toHaveBeenCalledExactlyOnceWith(false);

    // The trackpad's glide after the fingers lift is the same swipe.
    wheel(embla.root, WHEEL_STEP_PX * 3);
    act(() => {
      vi.advanceTimersByTime(WHEEL_REST_MS - 1);
    });
    wheel(embla.root, WHEEL_STEP_PX * 3);
    expect(embla.fake.scrollNext).toHaveBeenCalledOnce();

    // Once it rests, the next swipe counts, the other way too.
    act(() => {
      vi.advanceTimersByTime(WHEEL_REST_MS);
    });
    wheel(embla.root, -WHEEL_STEP_PX);
    expect(embla.fake.scrollPrev).toHaveBeenCalledExactlyOnceWith(false);
  });

  // A mouse wheel can count in lines, or in pages when the system scrolls a
  // screen at a time: a page sideways is the carousel's own width.
  test.each([
    ["lines", WheelEvent.DOM_DELTA_LINE, WHEEL_STEP_PX / WHEEL_LINE_PX],
    ["pages", WheelEvent.DOM_DELTA_PAGE, WHEEL_STEP_PX / 320],
  ])(
    "a sideways wheel that counts in %s moves one step once they add up to a step",
    (_unit, deltaMode, step) => {
      vi.useFakeTimers();
      const { embla } = setup();
      Object.defineProperty(embla.root, "clientWidth", { value: 320 });

      const short = wheel(embla.root, step * 0.75, 0, deltaMode);
      expect(short.defaultPrevented).toBe(true);
      expect(embla.fake.scrollNext).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(WHEEL_REST_MS);
      });
      wheel(embla.root, step, 0, deltaMode);
      expect(embla.fake.scrollNext).toHaveBeenCalledExactlyOnceWith(false);

      act(() => {
        vi.advanceTimersByTime(WHEEL_REST_MS);
      });
      wheel(embla.root, -step, 0, deltaMode);
      expect(embla.fake.scrollPrev).toHaveBeenCalledExactlyOnceWith(false);
    }
  );

  test("one notch of a wheel that scrolls a page at a time moves one step", () => {
    const { embla } = setup();
    Object.defineProperty(embla.root, "clientWidth", { value: 320 });

    wheel(embla.root, 1, 0, WheelEvent.DOM_DELTA_PAGE);

    expect(embla.fake.scrollNext).toHaveBeenCalledExactlyOnceWith(false);
  });

  test("a vertical scroll over it is left to the page", () => {
    const { embla } = setup();

    const scroll = wheel(embla.root, 30, 120);

    expect(scroll.defaultPrevented).toBe(false);
    expect(embla.fake.scrollNext).not.toHaveBeenCalled();
  });

  test("a trackpad swipe jumps under reduced motion", () => {
    const { embla } = setup({ reduced: true });

    wheel(embla.root, WHEEL_STEP_PX);

    expect(embla.fake.scrollNext).toHaveBeenCalledExactlyOnceWith(true);
  });

  test("lets go of Embla and of the wheel when it unmounts", () => {
    vi.useFakeTimers();
    const { embla, view } = setup();
    wheel(embla.root, 1);

    view.unmount();
    wheel(embla.root, WHEEL_STEP_PX * 2);

    expect(embla.listenerCount()).toBe(0);
    expect(embla.fake.scrollNext).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("before Embla is ready, it rests on its first slide with nowhere to go", async () => {
    const { position, user } = setup({ api: false });

    expect(position()).toBe("0/1 - -");
    // Nothing to move yet: the controls do nothing.
    await user.click(screen.getByRole("button", { name: "forward" }));
    await user.click(screen.getByRole("button", { name: "back" }));
    await user.click(screen.getByRole("button", { name: "third" }));
    expect(position()).toBe("0/1 - -");
  });
});

describe("useCarousel", () => {
  test("refuses to be used outside a carousel", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => renderWithI18n(<Probe />)).toThrow(
      "useCarousel must be used inside a <Carousel>."
    );
  });
});
