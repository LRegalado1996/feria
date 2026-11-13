"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

// A subpixel layout leaves `scrollLeft` a fraction short of the true edge.
const EDGE_TOLERANCE_PX = 1;

// A button moves most of a screenful, keeping the last slide in view as the
// first of the next, so the visitor never loses their place.
const PAGE_FRACTION = 0.8;

const SLIDE_SELECTOR = '[data-slot="store-slider-slide"]';

const CONTROL_CLASS =
  "flex size-11 items-center justify-center border border-store-foreground bg-store-foreground text-store-background transition-colors focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-store-foreground aria-disabled:border-store-line aria-disabled:bg-transparent aria-disabled:text-store-muted";

interface SliderPosition {
  atEnd: boolean;
  atStart: boolean;
  /** The slide at the left edge, from zero. */
  index: number;
}

const AT_START: SliderPosition = { atEnd: false, atStart: true, index: 0 };

function readPosition(scroller: HTMLElement): SliderPosition {
  const slides = scroller.querySelectorAll<HTMLElement>(SLIDE_SELECTOR);
  const origin = slides[0]?.offsetLeft ?? 0;
  const atStart = scroller.scrollLeft <= EDGE_TOLERANCE_PX;
  const atEnd =
    scroller.scrollLeft + scroller.clientWidth >=
    scroller.scrollWidth - EDGE_TOLERANCE_PX;

  if (atStart) {
    return { atEnd, atStart, index: 0 };
  }

  // The last slides cannot reach the left edge: at the end of the track the
  // position is the last one, not the one that happens to be leftmost.
  if (atEnd) {
    return { atEnd, atStart, index: Math.max(slides.length - 1, 0) };
  }

  let index = 0;
  for (const [candidate, slide] of slides.entries()) {
    if (slide.offsetLeft - origin <= scroller.scrollLeft + EDGE_TOLERANCE_PX) {
      index = candidate;
    }
  }

  return { atEnd, atStart, index };
}

export interface StoreSliderProps {
  className?: string;
  /** What sits beside the controls, usually the section's heading. */
  heading?: ReactNode;
  /** Names the scrolling region for assistive technology. */
  label: string;
  /** One slide each, keyed by a stable id. */
  slides: readonly { content: ReactNode; id: string }[];
}

/**
 * A horizontal row of slides that scrolls natively: a thumb drags it and it
 * settles on a slide (scroll snap), and the arrow keys scroll it once it has
 * focus, so it works before React hydrates. The buttons move it by most of a
 * screenful, and the counter follows the scroll position, whatever moved it.
 * Smooth scrolling is CSS, so reduced motion turns it into a jump with no
 * script involved.
 */
function StoreSlider({ className, heading, label, slides }: StoreSliderProps) {
  const { slider } = useDictionary().storefront;
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState(AT_START);

  useEffect(() => {
    if (!scroller) {
      return undefined;
    }

    const update = () => {
      const next = readPosition(scroller);

      // A scroll fires many events between two slides: keep the same object,
      // and skip the render, until something the interface shows changes.
      setPosition((current) =>
        current.index === next.index &&
        current.atStart === next.atStart &&
        current.atEnd === next.atEnd
          ? current
          : next
      );
    };

    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [scroller]);

  const move = (direction: -1 | 1) => {
    scroller?.scrollBy({
      left: direction * scroller.clientWidth * PAGE_FRACTION,
    });
  };

  return (
    <div
      className={cn("flex flex-col gap-5", className)}
      data-slot="store-slider"
    >
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">{heading}</div>
        <div className="flex shrink-0 items-center gap-3">
          {/* The list below already tells a screen reader how many items
              there are; the running position would only interrupt it. */}
          <p
            aria-hidden="true"
            className="text-sm font-medium text-store-muted tabular-nums"
            data-slot="store-slider-position"
          >
            {interpolate(slider.position, {
              current: position.index + 1,
              total: slides.length,
            })}
          </p>
          {/* `aria-disabled`, not `disabled`: a button that disables itself
              under the finger drops keyboard focus on the floor. */}
          <button
            aria-disabled={position.atStart}
            aria-label={slider.previous}
            className={CONTROL_CLASS}
            data-slot="store-slider-previous"
            onClick={() => {
              move(-1);
            }}
            type="button"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            aria-disabled={position.atEnd}
            aria-label={slider.next}
            className={CONTROL_CLASS}
            data-slot="store-slider-next"
            onClick={() => {
              move(1);
            }}
            type="button"
          >
            <ArrowRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
      <section
        aria-label={label}
        className="snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overflow-y-clip scroll-smooth focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-store-foreground motion-reduce:scroll-auto"
        data-slot="store-slider-track"
        ref={setScroller}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must take focus to be scrolled with the arrow keys (WCAG 2.1.1), and Safari does not focus a scroller on its own
        tabIndex={0}
      >
        <ul className="flex w-max gap-3 md:gap-6">
          {slides.map((slide) => (
            <li
              className="w-[65vw] max-w-70 shrink-0 snap-start"
              data-slot="store-slider-slide"
              key={slide.id}
            >
              {slide.content}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export { StoreSlider };
