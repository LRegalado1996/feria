import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const storeEyebrowVariants = cva("store-eyebrow", {
  variants: {
    tone: {
      default: "text-store-muted",
      // On a contrast block.
      contrast: "text-store-contrast-muted",
    },
  },
  defaultVariants: { tone: "default" },
});

export type StoreEyebrowProps = ComponentProps<"p"> &
  VariantProps<typeof storeEyebrowVariants>;

/**
 * The small uppercase label above a storefront heading. Storefront only: the
 * admin has no all-caps labels (design.md § Storefront).
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
