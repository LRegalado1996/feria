"use client";

import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-react";
import {
  type ComponentProps,
  createContext,
  type KeyboardEvent,
  use,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useDictionary } from "@/lib/hooks/i18n";
import { usePrefersReducedMotion } from "@/lib/hooks/ui";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

export type CarouselApi = UseEmblaCarouselType[1];
type CarouselOptions = Parameters<typeof useEmblaCarousel>[0];
type CarouselPlugins = Parameters<typeof useEmblaCarousel>[1];

/** How far a trackpad swipe travels before it moves the carousel one step. */
export const WHEEL_STEP_PX = 40;

/**
 * The pixels a line stands for, for a wheel that counts in lines
 * (`deltaMode`): a trackpad counts pixels, some mouse wheels lines.
 */
export const WHEEL_LINE_PX = 16;

/**
 * How long a swipe's wheel events must stop for the next swipe to count:
 * a trackpad keeps sending them, slower and slower, after the fingers lift.
 */
export const WHEEL_REST_MS = 220;

interface CarouselPosition {
  canScrollNext: boolean;
  canScrollPrev: boolean;
  /** The place the carousel rests on, from zero. */
  selectedIndex: number;
  /**
   * How many places it can rest on: fewer than slides when several show at
   * once, and 1 when everything fits, so there is nowhere to go.
   */
  snapCount: number;
}

interface CarouselContextValue extends CarouselPosition {
  api: CarouselApi;
  carouselRef: UseEmblaCarouselType[0];
  scrollNext: () => void;
  scrollPrev: () => void;
  scrollTo: (index: number) => void;
}

/** Before the script measures anything, the first place, with nowhere to go. */
const AT_REST: CarouselPosition = {
  canScrollNext: false,
  canScrollPrev: false,
  selectedIndex: 0,
  snapCount: 1,
};

const CarouselContext = createContext<CarouselContextValue | null>(null);

/**
 * How far a wheel event goes sideways, in pixels whatever it counts in: a
 * wheel set to scroll a screen at a time counts pages, and a page sideways
 * is the width of the window the slides move in.
 */
function sidewaysPixels(event: WheelEvent, viewport: HTMLElement): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaX * WHEEL_LINE_PX;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaX * viewport.clientWidth;
  }

  return event.deltaX;
}

/** The carousel around a control (a button, a dot): where it is, and how to move it. */
function useCarousel(): CarouselContextValue {
  const context = use(CarouselContext);

  if (!context) {
    throw new Error("useCarousel must be used inside a <Carousel>.");
  }

  return context;
}

export type CarouselProps = ComponentProps<"section"> & {
  /** Names the region, for assistive technology. */
  "aria-label": string;
  opts?: CarouselOptions;
  plugins?: CarouselPlugins;
};

/**
 * A row of slides (shadcn's Carousel, on Embla) that a finger or a mouse
 * drags, a trackpad swipes, and the arrow keys step through while focus is
 * inside it; Tab to a slide out of view brings it in. The steps a button or
 * a key asks for glide, or jump under reduced motion. It moves on its own
 * only with the autoplay plugin, which its caller adds and controls.
 */
function Carousel({
  children,
  className,
  opts,
  plugins,
  ...props
}: CarouselProps) {
  const copy = useDictionary().common.carousel;
  const [carouselRef, api] = useEmblaCarousel(opts, plugins);
  const reduced = usePrefersReducedMotion();
  const [position, setPosition] = useState(AT_REST);

  // Embla is the external system: its position is read whenever it settles
  // on another place or measures again.
  useEffect(() => {
    if (!api) {
      return undefined;
    }

    const read = (carousel: NonNullable<CarouselApi>) => {
      setPosition({
        canScrollNext: carousel.canScrollNext(),
        canScrollPrev: carousel.canScrollPrev(),
        selectedIndex: carousel.selectedScrollSnap(),
        snapCount: carousel.scrollSnapList().length,
      });
    };

    read(api);
    api.on("reInit", read).on("select", read);

    return () => {
      api.off("reInit", read).off("select", read);
    };
  }, [api]);

  // A horizontal swipe on a trackpad (or a sideways mouse wheel) moves one
  // step, once per swipe: Embla follows a finger and a mouse, not a wheel.
  // Not passive, so it can keep the browser from going back a page.
  useEffect(() => {
    if (!api) {
      return undefined;
    }

    const root = api.rootNode();
    let travelled = 0;
    let stepped = false;
    let resting: ReturnType<typeof setTimeout> | null = null;

    const onWheel = (event: WheelEvent) => {
      // Mostly up or down: the page's scroll, not the carousel's.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
        return;
      }

      event.preventDefault();

      if (resting !== null) {
        clearTimeout(resting);
      }

      resting = setTimeout(() => {
        resting = null;
        travelled = 0;
        stepped = false;
      }, WHEEL_REST_MS);

      if (stepped) {
        return;
      }

      travelled += sidewaysPixels(event, root);

      if (Math.abs(travelled) >= WHEEL_STEP_PX) {
        stepped = true;

        if (travelled > 0) {
          api.scrollNext(reduced);
        } else {
          api.scrollPrev(reduced);
        }
      }
    };

    root.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      root.removeEventListener("wheel", onWheel);

      if (resting !== null) {
        clearTimeout(resting);
      }
    };
  }, [api, reduced]);

  // One object while nothing it holds changes: every control reads it.
  const value = useMemo<CarouselContextValue>(
    () => ({
      ...position,
      api,
      carouselRef,
      scrollNext: () => {
        api?.scrollNext(reduced);
      },
      scrollPrev: () => {
        api?.scrollPrev(reduced);
      },
      scrollTo: (index: number) => {
        api?.scrollTo(index, reduced);
      },
    }),
    [api, carouselRef, position, reduced]
  );

  const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      value.scrollPrev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      value.scrollNext();
    }
  };

  return (
    <CarouselContext value={value}>
      {/* A section with a name: a region, described as a carousel. */}
      <section
        aria-roledescription={copy.roleDescription}
        className={cn("relative", className)}
        data-slot="carousel"
        onKeyDownCapture={onKeyDownCapture}
        {...props}
      >
        {children}
      </section>
    </CarouselContext>
  );
}

/**
 * The window the slides move in, and their track. The gap between slides is
 * the track's negative margin and each slide's padding (`-ml-4` and `pl-4`
 * by default), so Embla measures whole slides.
 */
function CarouselContent({ className, ...props }: ComponentProps<"div">) {
  const { carouselRef } = useCarousel();

  return (
    <div
      className="overflow-hidden"
      data-slot="carousel-content"
      ref={carouselRef}
    >
      <div
        className={cn("-ml-4 flex touch-pan-y touch-pinch-zoom", className)}
        data-slot="carousel-track"
        {...props}
      />
    </div>
  );
}

export type CarouselItemProps = ComponentProps<"div"> & {
  /** Its place, from zero, and how many there are: "2 de 6". */
  index: number;
  total: number;
};

/** One slide, named by its place among the others. */
function CarouselItem({
  className,
  index,
  total,
  ...props
}: CarouselItemProps) {
  const copy = useDictionary().common.carousel;

  return (
    <div
      aria-label={interpolate(copy.slide, { current: index + 1, total })}
      aria-roledescription={copy.slideRoleDescription}
      className={cn("min-w-0 shrink-0 grow-0 basis-full pl-4", className)}
      data-slot="carousel-item"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a slide is a named group (WAI-ARIA's carousel pattern); the tags the rule offers (fieldset, details, address) mean something else
      role="group"
      {...props}
    />
  );
}

export { Carousel, CarouselContent, CarouselItem, useCarousel };
