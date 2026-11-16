import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const storeEyebrowVariants = cva(
  "font-display text-xs leading-tight font-extrabold uppercase",
  {
    variants: {
      tone: {
        default: "text-store-muted",
        // On a contrast block.
        contrast: "text-store-contrast-muted",
      },
    },
    defaultVariants: { tone: "default" },
  }
);

export type StoreEyebrowProps = ComponentProps<"p"> &
  VariantProps<typeof storeEyebrowVariants>;

/**
 * The small label above a storefront heading, in the display face like the
 * store's other labels. Storefront only: the admin has no all-caps labels
 * (design.md § Storefront).
 */
function StoreEyebrow({
  className,
  tone = "default",
  ...props
}: StoreEyebrowProps) {
  return (
    <p
      className={cn(storeEyebrowVariants({ tone }), className)}
      data-slot="store-eyebrow"
      data-tone={tone}
      {...props}
    />
  );
}

export { StoreEyebrow, storeEyebrowVariants };
