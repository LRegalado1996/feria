"use client";

import createAutoplay from "embla-carousel-autoplay";
import { Pause, Play } from "lucide-react";
import { type FocusEvent, useEffect, useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
} from "@/app/_components/molecules/carousel";
import { StoreBanner } from "@/app/_components/molecules/store-banner";
import { useDictionary } from "@/lib/hooks/i18n";
import { usePrefersReducedMotion } from "@/lib/hooks/ui";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

/** How long each banner stays before the next one comes. */
export const COVER_DELAY_MS = 6000;

/** One banner of the cover. */
export interface StoreCoverBanner {
  /** Built by the caller with `localizePath()`. */
  href: string;
  /** Stable across renders: the banner's own id. */
  id: string;
  src: string;
  title: string;
}

export interface StoreCoverCarouselProps {
  banners: readonly StoreCoverBanner[];
  className?: string;
}

/**
 * The autoplay plugin's settings: it never starts on its own and ignores
 * hover and focus, since `RotatingCover` decides when it plays; a drag stops
 * it, and the cover starts it again once the finger lifts.
 */
const AUTOPLAY_OPTIONS = {
  delay: COVER_DELAY_MS,
  playOnInit: false,
  stopOnFocusIn: false,
  stopOnInteraction: true,
  stopOnMouseEnter: false,
};

/** What holds the cover still for a moment, besides the pause button. */
interface Holds {
  focus: boolean;
  hover: boolean;
  touch: boolean;
}

/**
 * The banners and their controls, inside the carousel: it rotates only
 * while nothing holds it (WCAG 2.2.2), and says the new banner politely
 * once it is still.
 */
function RotatingCover({ banners }: { banners: readonly StoreCoverBanner[] }) {
  const { storefront } = useDictionary();
  const copy = storefront.cover;
  const { api, scrollTo, selectedIndex } = useCarousel();
  const reduced = usePrefersReducedMotion();
  // The shopper's own choice, which hovering and leaving never undo.
  const [paused, setPaused] = useState(false);
  const [holds, setHolds] = useState<Holds>({
    focus: false,
    hover: false,
    touch: false,
  });
  const rotating =
    !reduced && !paused && !holds.focus && !holds.hover && !holds.touch;

  // The plugin Embla runs is the external system: it plays exactly while the
  // cover rotates. Embla starts its plugins anew, stopped, each time it
  // measures again (a resize), so the decision is applied again then too.
  // Before Embla is ready there is nothing to play.
  useEffect(() => {
    if (!api) {
      return undefined;
    }

    const apply = () => {
      const { autoplay } = api.plugins();

      if (rotating) {
        autoplay.play();
      } else {
        autoplay.stop();
      }
    };

    apply();
    api.on("reInit", apply);

    return () => {
      api.off("reInit", apply);
    };
  }, [api, rotating]);

  // A finger (or a mouse) dragging it holds it, from Embla's own events.
  useEffect(() => {
    if (!api) {
      return undefined;
    }

    const down = () => {
      setHolds((current) => ({ ...current, touch: true }));
    };
    const up = () => {
      setHolds((current) => ({ ...current, touch: false }));
    };
    api.on("pointerDown", down).on("pointerUp", up);

    return () => {
      api.off("pointerDown", down).off("pointerUp", up);
    };
  }, [api]);

  const hold = (reason: keyof Holds, on: boolean) => {
    setHolds((current) => ({ ...current, [reason]: on }));
  };

  return (
    <div
      className="relative"
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        // Only when focus leaves the cover, not when it moves inside it.
        if (!event.currentTarget.contains(event.relatedTarget)) {
          hold("focus", false);
        }
      }}
      onFocus={() => {
        hold("focus", true);
      }}
      onMouseEnter={() => {
        hold("hover", true);
      }}
      onMouseLeave={() => {
        hold("hover", false);
      }}
    >
      {/* Off while it rotates, so a screen reader is not interrupted every
          few seconds; polite once it is still. */}
      <CarouselContent aria-live={rotating ? "off" : "polite"} className="ml-0">
        {banners.map((banner, index) => (
          <CarouselItem
            className="pl-0"
            index={index}
            key={banner.id}
            total={banners.length}
          >
            <StoreBanner
              href={banner.href}
              priority={index === 0}
              shopNow={storefront.banner.shopNow}
              src={banner.src}
              title={banner.title}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      {/* Top right: the title and its link sit at the bottom left. */}
      <div
        className="absolute top-3 right-3 flex items-center rounded-full bg-store-contrast p-0.5 md:top-5 md:right-7"
        data-slot="store-cover-carousel-controls"
      >
        {banners.map((banner, index) => {
          const current = index === selectedIndex;

          return (
            <button
              aria-current={current ? "true" : undefined}
              aria-label={interpolate(copy.goTo, { current: index + 1 })}
              className="group/dot inline-flex size-11 items-center justify-center rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent"
              key={banner.id}
              onClick={() => {
                scrollTo(index);
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2.5 rounded-full border-2 border-store-accent",
                  current
                    ? "bg-store-accent"
                    : "group-hover/dot:bg-store-accent/40"
                )}
              />
            </button>
          );
        })}
        {reduced ? null : (
          <StoreButton
            aria-label={copy.pause}
            aria-pressed={paused}
            onClick={() => {
              setPaused((value) => !value);
            }}
            size="icon"
            variant="contrast"
          >
            {paused ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
          </StoreButton>
        )}
      </div>
    </div>
  );
}

/** Two banners or more: a carousel that moves on its own. */
function CoverCarousel({
  banners,
  className,
}: Required<StoreCoverCarouselProps>) {
  const copy = useDictionary().storefront.cover;

  // Embla keeps the plugin it was first handed: one made again with the
  // same options on a later render is the same to it, and changes nothing.
  return (
    <Carousel
      aria-label={copy.label}
      className={className}
      data-slot="store-cover-carousel"
      opts={{ loop: true }}
      plugins={[createAutoplay(AUTOPLAY_OPTIONS)]}
    >
      <RotatingCover banners={banners} />
    </Carousel>
  );
}

/**
 * The cover (FER-039): several photo banners in one carousel, moving on
 * their own every few seconds, with a dot for each and a pause button. It
 * holds still while hovered, focused or touched, and never moves under
 * reduced motion, where it has no pause button to offer. One banner shows
 * still, without controls; none, nothing. The home places it (FER-022).
 */
function StoreCoverCarousel({
  banners,
  className = "",
}: StoreCoverCarouselProps) {
  const shopNow = useDictionary().storefront.banner.shopNow;
  const [only] = banners;

  if (!only) {
    return null;
  }

  if (banners.length === 1) {
    return (
      <StoreBanner
        className={className}
        href={only.href}
        priority
        shopNow={shopNow}
        src={only.src}
        title={only.title}
      />
    );
  }

  return <CoverCarousel banners={banners} className={className} />;
}

export { StoreCoverCarousel };
