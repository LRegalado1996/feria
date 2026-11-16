import { cva, type VariantProps } from "class-variance-authority";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const storeArrowLinkVariants = cva(
  // The display face and the arrow say it is a link; the underline joins
  // them on hover. 44 px tall: tapped with a thumb.
  "group inline-flex min-h-11 items-center gap-2 font-display text-xs leading-none font-extrabold uppercase underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 md:text-sm",
  {
    variants: {
      tone: {
        default: "text-store-foreground focus-visible:outline-store-foreground",
        // On a contrast block: the accent, 11:1 on the contrast.
        contrast: "text-store-accent focus-visible:outline-store-accent",
      },
    },
    defaultVariants: { tone: "default" },
  }
);

export type StoreArrowLinkProps = ComponentProps<typeof Link> &
  VariantProps<typeof storeArrowLinkVariants>;

/**
 * A storefront link that leads somewhere else in the store ("Comprar ahora
 * →"), its arrow nudged forward on hover. The caller builds `href` with
 * `localizePath()`.
 */
function StoreArrowLink({
  children,
  className,
  tone = "default",
  ...props
}: StoreArrowLinkProps) {
  return (
    <Link
      className={cn(storeArrowLinkVariants({ tone }), className)}
      data-slot="store-arrow-link"
      data-tone={tone}
      {...props}
    >
      <span>{children}</span>
      <ArrowRight
        aria-hidden="true"
        className="size-4 shrink-0 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
        data-slot="store-arrow-link-arrow"
      />
    </Link>
  );
}

export { StoreArrowLink, storeArrowLinkVariants };
