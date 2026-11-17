import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type StoreBadgeProps = ComponentProps<"span">;

/**
 * A short notice on an article's tile ("Nuevo"), in the display face: the
 * page's white with the foreground on it, 18:1, so it reads on the grey tile
 * and on a photo alike.
 */
function StoreBadge({ className, ...props }: StoreBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center bg-store-background px-2 py-1.5 font-display text-xs leading-none font-extrabold text-store-foreground uppercase",
        className
      )}
      data-slot="store-badge"
      {...props}
    />
  );
}

export { StoreBadge };
