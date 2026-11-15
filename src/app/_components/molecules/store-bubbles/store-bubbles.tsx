"use client";

import { type CSSProperties, type ReactNode, useState } from "react";

import { usePrefersReducedMotion } from "@/lib/hooks/ui";
import { cn } from "@/lib/utils";

/**
 * One burst. Written out, not random: the server and the browser must render
 * the same bubbles. Each drifts right and down by a share of the viewport
 * (`x` in vw, `y` in vh), and the longest is gone in 4.5 s, delay included.
 */
const BUBBLES = [
  { delay: 0, duration: 2600, size: 28, x: 18, y: 22 },
  { delay: 80, duration: 3200, size: 64, x: 46, y: 30 },
  { delay: 160, duration: 2800, size: 20, x: 30, y: 54 },
  { delay: 240, duration: 3600, size: 88, x: 72, y: 44 },
  { delay: 320, duration: 3000, size: 36, x: 58, y: 14 },
  { delay: 420, duration: 3400, size: 48, x: 24, y: 76 },
  { delay: 520, duration: 3800, size: 24, x: 84, y: 66 },
  { delay: 620, duration: 3200, size: 72, x: 40, y: 82 },
  { delay: 720, duration: 3600, size: 32, x: 66, y: 72 },
  { delay: 820, duration: 3400, size: 56, x: 88, y: 26 },
] as const;

/** `CSSProperties` has no custom properties: this names the four a bubble sets. */
type BubbleStyle = CSSProperties &
  Record<`--store-bubble-${"delay" | "duration" | "x" | "y"}`, string>;

function bubbleStyle(bubble: (typeof BUBBLES)[number]): BubbleStyle {
  return {
    "--store-bubble-delay": `${bubble.delay}ms`,
    "--store-bubble-duration": `${bubble.duration}ms`,
    "--store-bubble-x": `${bubble.x}vw`,
    "--store-bubble-y": `${bubble.y}vh`,
    height: bubble.size,
    width: bubble.size,
  };
}

export interface StoreBubblesProps {
  /** What blows the bubbles: the logo. */
  children: ReactNode;
  className?: string;
  /** The button's name ("Make bubbles"). */
  label: string;
}

/**
 * A burst of bubbles blown from its content, once when the page loads and
 * again every time the visitor presses it: the stall sells bubble guns. The
 * bubbles are decoration, drawn over the nearest positioned ancestor, which
 * clips them; they never take a click.
 *
 * A burst ends by itself in under five seconds, so it needs no pause control
 * (WCAG 2.2.2). A visitor who asked for less motion gets the content alone:
 * no bubbles, and no button that would do nothing.
 */
function StoreBubbles({ children, className, label }: StoreBubblesProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [burst, setBurst] = useState(0);

  if (reducedMotion) {
    return (
      <span className={className} data-slot="store-bubbles">
        {children}
      </span>
    );
  }

  return (
    <>
      <button
        aria-label={label}
        className={cn(
          "group relative z-10 flex min-h-11 items-center focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-store-accent",
          className
        )}
        data-slot="store-bubbles"
        onClick={() => {
          setBurst((count) => count + 1);
        }}
        type="button"
      >
        <span className="origin-left motion-safe:transition-transform motion-safe:group-hover:-rotate-6 motion-safe:group-active:scale-90">
          {children}
        </span>
      </button>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
        data-burst={burst}
        data-slot="store-bubbles-layer"
        data-testid="store-bubbles-layer"
        // A new key is a new element: the only way to play a CSS animation again.
        key={burst}
      >
        {BUBBLES.map((bubble) => (
          <span
            className="absolute top-8 left-6 rounded-full border-2 border-store-accent opacity-0 motion-safe:animate-store-bubble"
            data-slot="store-bubble"
            key={bubble.delay}
            style={bubbleStyle(bubble)}
          />
        ))}
      </span>
    </>
  );
}

export { StoreBubbles };
