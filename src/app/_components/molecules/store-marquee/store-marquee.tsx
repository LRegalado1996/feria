"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Pause, Play, Tag } from "lucide-react";
import { useState } from "react";

import { useDictionary } from "@/lib/hooks/i18n";
import { cn } from "@/lib/utils";

const storeMarqueeVariants = cva("relative flex overflow-x-clip", {
  variants: {
    tone: {
      contrast: "bg-store-contrast text-store-background",
      accent: "bg-store-accent text-store-foreground",
    },
  },
  defaultVariants: { tone: "contrast" },
});

const separatorVariants = cva("size-6 shrink-0", {
  variants: {
    tone: {
      contrast: "text-store-accent",
      accent: "text-store-foreground",
    },
  },
});

const pauseVariants = cva(
  "absolute inset-y-0 right-0 flex w-11 items-center justify-center focus-visible:outline-3 focus-visible:-outline-offset-3 motion-reduce:hidden",
  {
    variants: {
      tone: {
        contrast:
          "bg-store-contrast text-store-background focus-visible:outline-store-accent",
        accent:
          "bg-store-accent text-store-foreground focus-visible:outline-store-foreground",
      },
    },
  }
);

export type StoreMarqueeProps = VariantProps<typeof storeMarqueeVariants> & {
  className?: string;
  /** Short phrases; they are distinct, they key the list. */
  items: readonly string[];
};

/**
 * The storefront's moving band: the one thing on a page that moves on its
 * own. The track holds the phrases twice and slides by half its width, so the
 * loop has no seam; the second copy is hidden from assistive technology.
 *
 * Content that moves for more than five seconds needs a way to stop it (WCAG
 * 2.2.2), hence the pause button. Under reduced motion the band does not move
 * at all: the phrases wrap in place and there is nothing to pause.
 */
function StoreMarquee({
  className,
  items,
  tone = "contrast",
}: StoreMarqueeProps) {
  const { marquee } = useDictionary().storefront;
  const [paused, setPaused] = useState(false);

  const phrases = items.map((item) => (
    <span className="flex shrink-0 items-center gap-6" key={item}>
      <span>{item}</span>
      <Tag aria-hidden="true" className={separatorVariants({ tone })} />
    </span>
  ));

  return (
    <div
      className={cn(storeMarqueeVariants({ tone }), className)}
      data-paused={paused}
      data-slot="store-marquee"
      data-tone={tone}
    >
      <div
        className={cn(
          "flex w-max font-display text-2xl leading-none font-normal tracking-display uppercase motion-safe:animate-store-marquee motion-reduce:w-full md:text-4xl",
          paused && "[animation-play-state:paused]"
        )}
        data-slot="store-marquee-track"
        data-testid="store-marquee-track"
      >
        <div className="flex shrink-0 items-center gap-6 px-3 py-4 motion-reduce:shrink motion-reduce:flex-wrap md:py-5">
          {phrases}
        </div>
        <div
          aria-hidden="true"
          className="flex shrink-0 items-center gap-6 px-3 py-4 motion-reduce:hidden md:py-5"
        >
          {phrases}
        </div>
      </div>
      <button
        aria-label={marquee.pause}
        aria-pressed={paused}
        className={pauseVariants({ tone })}
        data-slot="store-marquee-pause"
        onClick={() => {
          setPaused((current) => !current);
        }}
        type="button"
      >
        {paused ? (
          <Play aria-hidden="true" className="size-5" />
        ) : (
          <Pause aria-hidden="true" className="size-5" />
        )}
      </button>
    </div>
  );
}

export { StoreMarquee, storeMarqueeVariants };
