"use client";

import { useEffect, useState } from "react";

import { useLocale } from "@/lib/hooks/i18n";
import { usePrefersReducedMotion, useScrollEntry } from "@/lib/hooks/ui";
import { cn } from "@/lib/utils";
import { formatInteger } from "@/lib/utils/format";

const DURATION_MS = 1200;

/** Fast at first, settling into the final figure. */
function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3;
}

export interface StoreCountUpProps {
  className?: string;
  "data-testid"?: string;
  /** The whole number it ends on. */
  value: number;
}

/**
 * A figure that counts up from zero when it scrolls into view. The server
 * renders the final value, and that is what a screen reader gets throughout:
 * the running digits are decoration. A figure already on screen when the page
 * hydrates, or a visitor who asked for less motion, sees the final value and
 * nothing else.
 */
function StoreCountUp({
  className,
  "data-testid": testId,
  value,
}: StoreCountUpProps) {
  const locale = useLocale();
  const reducedMotion = usePrefersReducedMotion();
  const [ref, state] = useScrollEntry();
  const [progress, setProgress] = useState(0);
  // The count plays once. Finished, or skipped because motion was reduced
  // when the figure came in, it never starts again: a visitor who changes
  // the setting afterwards must not see a final figure fall back to zero.
  const [settled, setSettled] = useState(false);
  const counting = state !== "idle" && !reducedMotion && !settled;

  // Decided while rendering, not in an effect: the skipped count is settled
  // in the same render that learns of it.
  if (state === "entered" && reducedMotion && !settled) {
    setSettled(true);
  }

  useEffect(() => {
    if (state !== "entered" || settled || reducedMotion) {
      return undefined;
    }

    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = Math.min((now - startedAt) / DURATION_MS, 1);
      setProgress(elapsed);

      if (elapsed < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setSettled(true);
      }
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [state, reducedMotion, settled]);

  const shown = counting ? Math.round(value * easeOutCubic(progress)) : value;

  return (
    <span
      className={cn("tabular-nums", className)}
      data-slot="store-count-up"
      data-state={state}
      data-testid={testId}
      ref={ref}
    >
      <span className="sr-only">{formatInteger(value, locale)}</span>
      <span aria-hidden="true" data-slot="store-count-up-figure">
        {formatInteger(shown, locale)}
      </span>
    </span>
  );
}

export { StoreCountUp };
