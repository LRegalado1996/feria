import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";

import { StoreSlider } from "./store-slider";

const SLIDE_WIDTH = 240;
const VIEWPORT_WIDTH = 360;

function makeSlides(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    content: <p>{`Article ${index + 1}`}</p>,
    id: `article-${index + 1}`,
  }));
}

/**
 * happy-dom lays nothing out, so the geometry a browser would report is set
 * by hand: `count` slides of 240px in a 360px viewport.
 */
function layOut(track: HTMLElement, count: number) {
  Object.defineProperty(track, "clientWidth", {
    configurable: true,
    value: VIEWPORT_WIDTH,
  });
  Object.defineProperty(track, "scrollWidth", {
    configurable: true,
    value: Math.max(count * SLIDE_WIDTH, VIEWPORT_WIDTH),
  });
  for (const [index, slide] of [
    ...track.querySelectorAll<HTMLElement>('[data-slot="store-slider-slide"]'),
  ].entries()) {
    Object.defineProperty(slide, "offsetLeft", {
      configurable: true,
      // Not zero-based: the track has its own offset in the page.
      value: 16 + index * SLIDE_WIDTH,
    });
  }
}

function setup({
  count = 6,
  locale = "en",
}: { count?: number; locale?: Locale } = {}) {
  const user = userEvent.setup();
  const view = renderWithI18n(
    <StoreSlider
      className="mt-8"
      heading={<h2>Just arrived</h2>}
      label="Sample articles"
      slides={makeSlides(count)}
    />,
    { locale }
  );
  const track = screen.getByRole("region");
  layOut(track, count);
  const scrollBy = vi.fn<(options: ScrollToOptions) => void>();
  Object.defineProperty(track, "scrollBy", { value: scrollBy });

  const scrollTo = (left: number) => {
    act(() => {
      track.scrollLeft = left;
      fireEvent.scroll(track);
    });
  };
  // The layout above is in place only after the first measure ran.
  scrollTo(0);

  return {
    next: screen.getByRole("button", {
      name: locale === "en" ? "Next" : "Siguiente",
    }),
    position: () =>
      view.container.querySelector('[data-slot="store-slider-position"]')
        ?.textContent,
    previous: screen.getByRole("button", {
      name: locale === "en" ? "Previous" : "Anterior",
    }),
    scrollBy,
    scrollTo,
    track,
    user,
    view,
  };
}

describe("StoreSlider", () => {
  test("the server renders every slide, at the first position", () => {
    const Wrapper = createI18nWrapper("en");

    const html = renderToString(
      <Wrapper>
        <StoreSlider label="Sample articles" slides={makeSlides(3)} />
      </Wrapper>
    );

    expect(html).toContain("<p>Article 1</p>");
    expect(html).toContain("<p>Article 3</p>");
    expect(html).toContain(">1 / 3</p>");
  });

  test("is a named region holding a list with one item per slide", () => {
    const { track } = setup({ count: 3 });

    expect(track).toHaveAccessibleName("Sample articles");
    expect(
      within(track)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Article 1", "Article 2", "Article 3"]);
  });

  test("shows its heading and keeps a caller's class", () => {
    const { view } = setup();

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Just arrived"
    );
    expect(view.container.firstElementChild).toHaveClass("mt-8", "flex");
  });

  test("takes keyboard focus, so the arrow keys can scroll it, and snaps to slides", () => {
    const { track } = setup();

    expect(track).toHaveAttribute("tabindex", "0");
    expect(track).toHaveClass("overflow-x-auto", "snap-x", "snap-mandatory");
    expect(within(track).getAllByRole("listitem")[0]).toHaveClass("snap-start");
  });

  test("leaves room around the slides for a card's focus outline", () => {
    const { track } = setup();

    expect(track).toHaveClass("p-2", "-m-2", "scroll-p-2");
  });

  test("scrolls smoothly, and jumps under reduced motion", () => {
    const { track } = setup();

    expect(track).toHaveClass("scroll-smooth", "motion-reduce:scroll-auto");
  });

  test.each([
    ["en", "Next", "Previous"],
    ["es", "Siguiente", "Anterior"],
  ] as const)(
    "in %s its buttons are named %s and %s",
    (locale, next, previous) => {
      const slider = setup({ locale });

      expect(slider.next).toHaveAccessibleName(next);
      expect(slider.previous).toHaveAccessibleName(previous);
    }
  );

  test("starts at the first slide: nothing before it, more after", () => {
    const { next, position, previous } = setup();

    expect(position()).toBe("1 / 6");
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveAttribute("aria-disabled", "false");
  });

  test.each([
    // One pixel is still the start: subpixel layouts never report a clean 0.
    [1, "1 / 6", "true"],
    [2, "1 / 6", "false"],
    // A slide counts once its left edge reaches the track's, within a pixel.
    [238, "1 / 6", "false"],
    [239, "2 / 6", "false"],
    [240, "2 / 6", "false"],
    [480, "3 / 6", "false"],
  ] as const)(
    "scrolled to %ipx it reads %s",
    (left, text, previousDisabled) => {
      const { position, previous, scrollTo } = setup();

      scrollTo(left);

      expect(position()).toBe(text);
      expect(previous).toHaveAttribute("aria-disabled", previousDisabled);
    }
  );

  test.each([
    // 6 x 240 = 1440 wide, 360 visible: the end is at 1080, within a pixel.
    [1078, "5 / 6", "false"],
    [1079, "6 / 6", "true"],
    [1080, "6 / 6", "true"],
  ] as const)(
    "scrolled to %ipx, next to the end, it reads %s",
    (left, text, nextDisabled) => {
      const { next, position, scrollTo } = setup();

      scrollTo(left);

      expect(position()).toBe(text);
      expect(next).toHaveAttribute("aria-disabled", nextDisabled);
    }
  );

  test("when every slide fits, both buttons rest and the position is the first", () => {
    const { next, position, previous } = setup({ count: 1 });

    expect(position()).toBe("1 / 1");
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveAttribute("aria-disabled", "true");
  });

  test("an empty slider reads 0 / 0: there is no first slide", () => {
    const { next, position, previous } = setup({ count: 0 });

    expect(position()).toBe("0 / 0");
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveAttribute("aria-disabled", "true");
  });

  test("an empty track scrolled to its end never reads a position below zero", () => {
    const { position, scrollTo } = setup({ count: 0 });

    scrollTo(5);

    expect(position()).toBe("0 / 0");
  });

  test("measures again when slides are added, with no scroll or resize", () => {
    const { next, position, track, view } = setup({ count: 1 });
    expect(next).toHaveAttribute("aria-disabled", "true");

    view.rerender(
      <StoreSlider label="Sample articles" slides={makeSlides(6)} />
    );
    layOut(track, 6);
    // The layout stub lands after the commit; one more slide triggers the
    // measure against it.
    view.rerender(
      <StoreSlider label="Sample articles" slides={makeSlides(7)} />
    );

    expect(position()).toBe("1 / 7");
    expect(next).toHaveAttribute("aria-disabled", "false");
  });

  test("next moves forward by most of a screenful, previous moves back", async () => {
    const { next, previous, scrollBy, user } = setup();

    await user.click(next);
    expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ left: 288 });

    await user.click(previous);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -288 });
  });

  test("its buttons stay focusable at the edges: they are aria-disabled, never disabled", () => {
    const { next, previous, scrollTo } = setup();
    scrollTo(1080);

    expect(previous).toBeEnabled();
    expect(next).toBeEnabled();
    expect(next).toHaveAttribute("aria-disabled", "true");
  });

  test("measures again when the window is resized", () => {
    const { next, track } = setup();
    expect(next).toHaveAttribute("aria-disabled", "false");

    Object.defineProperty(track, "clientWidth", {
      configurable: true,
      value: 1440,
    });
    act(() => {
      fireEvent(window, new Event("resize"));
    });

    expect(next).toHaveAttribute("aria-disabled", "true");
  });

  test("stops listening to the scroll and the window on unmount", () => {
    const onElement = vi.spyOn(HTMLElement.prototype, "addEventListener");
    const onWindow = vi.spyOn(window, "addEventListener");
    const { track, view } = setup();
    // React listens for scroll on its own root too: the slider's listener is
    // the one registered on the track itself.
    const onScroll = onElement.mock.calls.find(
      ([type], call) =>
        type === "scroll" && onElement.mock.contexts[call] === track
    );
    const onResize = onWindow.mock.calls.find(([type]) => type === "resize");
    const offTrack = vi.spyOn(track, "removeEventListener");
    const offWindow = vi.spyOn(window, "removeEventListener");

    view.unmount();

    // The very callbacks it registered: removing a fresh function would
    // leave both listeners in place.
    expect(onScroll?.[1]).toBeTypeOf("function");
    expect(onResize?.[1]).toBeTypeOf("function");
    expect(offTrack).toHaveBeenCalledExactlyOnceWith("scroll", onScroll?.[1]);
    expect(offWindow).toHaveBeenCalledWith("resize", onResize?.[1]);
  });
});
