import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const storeBadgeVariants = cva(
  "inline-flex items-center px-3 py-1.5 font-display text-lg leading-none font-normal tracking-display uppercase",
  {
    variants: {
      tone: {
        // Foreground on the accent: 14.5:1 with the default palette.
        accent: "bg-store-accent text-store-foreground",
        // Background on the contrast color: 16.7:1 with the default palette.
        contrast: "bg-store-contrast text-store-background",
      },
    },
    defaultVariants: { tone: "accent" },
  }
);

export type StoreBadgeProps = ComponentProps<"span"> &
  VariantProps<typeof storeBadgeVariants>;

/** A short notice on an article ("New", "Price drop"), in the display face. */
function StoreBadge({ className, tone = "accent", ...props }: StoreBadgeProps) {
  return (
    <span
      className={cn(storeBadgeVariants({ tone }), className)}
      data-slot="store-badge"
      data-tone={tone}
      {...props}
    />
  );
}

export { StoreBadge, storeBadgeVariants };
