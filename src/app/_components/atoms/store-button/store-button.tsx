import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const storeButtonVariants = cva(
  // A pill, 44 px tall at least: tapped with a thumb. Its words are in the
  // display face; an icon-only one is a circle. The hand on hover, like a
  // link's: a button keeps the arrow by default (FER-050).
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-display leading-none font-extrabold whitespace-nowrap uppercase transition-[color,background-color,filter] focus-visible:outline-3 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The one action of a view (add to cart, place the order): the
        // accent on the ink, 14:1, like landonorris.store; moss on hover.
        primary:
          "bg-store-foreground text-store-accent hover:bg-store-contrast focus-visible:outline-store-foreground",
        // A round arrow over a photo (a row, the gallery): the ink on the
        // accent, 14:1, so it reads on any photo.
        accent:
          "bg-store-accent text-store-foreground hover:brightness-95 focus-visible:outline-store-foreground",
        // The second action: an outline in the foreground on the page.
        outline:
          "border-2 border-store-foreground bg-store-background text-store-foreground hover:bg-store-surface focus-visible:outline-store-foreground",
        // A control with no fill of its own, on the page or the tile.
        ghost:
          "text-store-foreground hover:bg-store-surface focus-visible:outline-store-foreground",
        // A control on a contrast block (the header, the footer, the search
        // panel): the accent on the contrast, 11:1.
        contrast:
          "text-store-accent hover:bg-store-accent/15 focus-visible:outline-store-accent",
      },
      size: {
        md: "min-h-11 px-5 text-xs [&_svg:not([class*='size-'])]:size-4",
        lg: "min-h-13 px-7 text-sm [&_svg:not([class*='size-'])]:size-5",
        icon: "size-11 [&_svg:not([class*='size-'])]:size-5",
        "icon-lg": "size-13 [&_svg:not([class*='size-'])]:size-6",
        // A 36 px circle for controls laid over a photo (FER-019), whose
        // invisible frame keeps a 44 px target for a thumb.
        "icon-sm":
          "relative size-9 before:absolute before:-inset-1 before:content-[''] [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: { size: "md", variant: "primary" },
  }
);

export type StoreButtonProps = ComponentProps<"button"> &
  VariantProps<typeof storeButtonVariants> & {
    /** Styles the link (or other element) passed as the only child. */
    asChild?: boolean;
  };

/**
 * The storefront's button (FER-039): a pill in the display face, or a circle
 * around an icon. `asChild` styles a link that does the job of a button
 * (going to the catalog, writing on WhatsApp), so both look the same.
 */
function StoreButton({
  asChild = false,
  className,
  size = "md",
  variant = "primary",
  ...props
}: StoreButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      className={cn(storeButtonVariants({ size, variant }), className)}
      data-size={size}
      data-slot="store-button"
      data-variant={variant}
      {...props}
    />
  );
}

export { StoreButton, storeButtonVariants };
