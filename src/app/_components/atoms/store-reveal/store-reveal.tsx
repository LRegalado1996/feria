"use client";

import type { ComponentProps } from "react";

import { useScrollEntry } from "@/lib/hooks/ui";
import { cn } from "@/lib/utils";

// No `ref`: the component needs its own to watch itself, and a caller's
// would replace it and leave the block unwatched.
export type StoreRevealProps = Omit<ComponentProps<"div">, "ref">;

/**
 * Fades and lifts its content into place once, when it scrolls into view.
 * The content is in the server's HTML and visible from the start: only what
 * is still off screen after the page hydrates is held back, so nothing the
 * visitor has seen ever blinks. Motion is `transform` and `opacity` only, and
 * none of it applies under reduced motion.
 */
function StoreReveal({ className, ...props }: StoreRevealProps) {
  const [ref, state] = useScrollEntry();

  return (
    <div
      className={cn(
        "motion-safe:transition-[opacity,transform] motion-safe:duration-500 motion-safe:ease-out motion-safe:data-[state=pending]:translate-y-4 motion-safe:data-[state=pending]:opacity-0",
        className
      )}
      data-slot="store-reveal"
      data-state={state}
      ref={ref}
      {...props}
    />
  );
}

export { StoreReveal };
