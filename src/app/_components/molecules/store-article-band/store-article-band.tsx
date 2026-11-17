"use client";

import type { CSSProperties } from "react";

import { useSeenOnce } from "@/lib/hooks/ui";
import { cn } from "@/lib/utils";

/**
 * The bubbles that rise through the band, written out so the server and the
 * browser agree: where each starts along the bottom (`left`, in % of the
 * band), how wide it is, and its drift up and sideways. The last one is gone
 * 4.6 s after the band starts to move.
 */
export const BAND_BUBBLES = [
  { delay: 0, duration: 3800, left: 8, rise: 210, size: 22, sway: 24 },
  { delay: 300, duration: 4000, left: 22, rise: 260, size: 40, sway: -18 },
  { delay: 150, duration: 3600, left: 37, rise: 190, size: 16, sway: 30 },
  { delay: 450, duration: 4100, left: 51, rise: 280, size: 54, sway: -26 },
  { delay: 250, duration: 3700, left: 64, rise: 230, size: 28, sway: 20 },
  { delay: 550, duration: 3900, left: 77, rise: 250, size: 36, sway: -22 },
  { delay: 100, duration: 4000, left: 90, rise: 200, size: 18, sway: 16 },
] as const;

/** How long the band moves once it scrolls in: under five seconds. */
export const BAND_MOTION_MS = 4800;

type MotionStyle = CSSProperties &
  Partial<
    Record<
      `--store-${"bubble-delay" | "bubble-duration" | "bubble-x" | "bubble-y" | "drift-from" | "drift-to"}`,
      string
    >
  >;

function bubbleStyle(bubble: (typeof BAND_BUBBLES)[number]): MotionStyle {
  return {
    "--store-bubble-delay": `${bubble.delay}ms`,
    "--store-bubble-duration": `${bubble.duration}ms`,
    "--store-bubble-x": `${bubble.sway}px`,
    "--store-bubble-y": `${-bubble.rise}px`,
    height: bubble.size,
    left: `${bubble.left}%`,
    width: bubble.size,
  };
}

/** A line's drift: where it rests before it moves, and where it stops. */
function driftStyle(from: string, to: string): MotionStyle {
  return {
    "--store-drift-from": from,
    "--store-drift-to": to,
    animationDuration: `${BAND_MOTION_MS}ms`,
    transform: `translateX(${from})`,
  };
}

/** A four-pointed star between the words, drawn so every face has it. */
function Star({ className }: { className?: string }) {
  return (
    <svg
      className={cn("shrink-0", className)}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 0c.9 6.4 5.6 11.1 12 12-6.4.9-11.1 5.6-12 12-.9-6.4-5.6-11.1-12-12C6.4 11.1 11.1 6.4 12 0Z" />
    </svg>
  );
}

/** Three copies of the words: wider than any screen, so a drift never shows an end. */
const COPIES = ["first", "second", "third"] as const;

export interface StoreArticleBandProps {
  className?: string;
  /** The store's own words, in the page's language. */
  words: readonly string[];
}

/**
 * The moss band between an article and its suggestions (FER-039): the
 * store's words large in lime, an outlined line under them, and soap
 * bubbles, since bubble guns are half of what the stall sells. Decoration
 * only: hidden from screen readers, nothing to focus, and every word in it
 * is said elsewhere on the page.
 *
 * It is in the server's HTML and still until it is half on screen, at load
 * or later; then the two lines drift a little, one each way, and the
 * bubbles rise, and all of it is still again within five seconds, so it
 * needs no pause control (WCAG 2.2.2): a finite flourish, like a heading's
 * rise. Under reduced motion it never moves. Only `transform` and `opacity` animate,
 * and the band's height is fixed, so nothing around it moves.
 */
function StoreArticleBand({ className, words }: StoreArticleBandProps) {
  const [ref, playing] = useSeenOnce();

  const line = (star: string) =>
    COPIES.map((copy) => (
      <span className="flex shrink-0 items-center gap-5 md:gap-8" key={copy}>
        {words.map((word) => (
          <span
            className="flex shrink-0 items-center gap-5 md:gap-8"
            key={word}
          >
            <span>{word}</span>
            <Star className={star} />
          </span>
        ))}
      </span>
    ));

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative flex h-55 flex-col justify-center gap-3 overflow-hidden bg-store-contrast font-display leading-none font-extrabold whitespace-nowrap uppercase md:h-80 md:gap-5",
        className
      )}
      data-playing={playing}
      data-slot="store-article-band"
      data-testid="store-article-band"
      ref={ref}
    >
      <div
        className="flex w-max gap-5 store-display-banner text-store-accent motion-safe:data-[playing=true]:animate-store-drift md:gap-8"
        data-playing={playing}
        data-slot="store-article-band-line"
        style={driftStyle("-4%", "-14%")}
      >
        {line("size-5 md:size-8")}
      </div>
      <div
        className="flex w-max gap-5 store-display-banner store-text-outline opacity-70 motion-safe:data-[playing=true]:animate-store-drift md:gap-8"
        data-playing={playing}
        data-slot="store-article-band-line"
        style={driftStyle("-18%", "-8%")}
      >
        {line("size-5 text-store-accent md:size-8")}
      </div>
      {playing ? (
        <span
          className="pointer-events-none absolute inset-0 motion-reduce:hidden"
          data-slot="store-article-band-bubbles"
        >
          {BAND_BUBBLES.map((bubble) => (
            <span
              className="absolute bottom-2 rounded-full border-2 border-store-accent opacity-0 motion-safe:animate-store-bubble"
              data-slot="store-bubble"
              key={bubble.left}
              style={bubbleStyle(bubble)}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}

export { StoreArticleBand };
