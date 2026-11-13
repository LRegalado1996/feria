import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const storeChipVariants = cva(
  // 44px tall: a filter is tapped with a thumb.
  "inline-flex min-h-11 items-center justify-center border border-store-foreground px-4 text-base font-medium transition-colors focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-store-foreground",
  {
    variants: {
      selected: {
        true: "bg-store-foreground text-store-background",
        false: "text-store-foreground hover:bg-store-line",
      },
    },
    defaultVariants: { selected: false },
  }
);

export type StoreChipProps = ComponentProps<"span"> & {
  asChild?: boolean;
  /** The filter in effect. The chip only paints it: the link or button it
   *  styles states it (`aria-current`, `aria-pressed`). */
  selected?: boolean;
};

/**
 * A storefront filter chip. With `asChild` it styles the link or button that
 * applies the filter.
 */
function StoreChip({
  asChild = false,
  className,
  selected = false,
  ...props
}: StoreChipProps) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      className={cn(storeChipVariants({ selected }), className)}
      data-selected={selected}
      data-slot="store-chip"
      {...props}
    />
  );
}

export { StoreChip, storeChipVariants };
