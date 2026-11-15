import { cva, type VariantProps } from "class-variance-authority";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const storeArrowLinkVariants = cva(
  "group inline-flex min-h-11 items-center gap-3 text-base font-semibold underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-3",
  {
    variants: {
      tone: {
        default: "text-store-foreground focus-visible:outline-store-foreground",
        // On a contrast block.
        contrast: "text-store-background focus-visible:outline-store-accent",
      },
    },
    defaultVariants: { tone: "default" },
  }
);

const arrowBoxVariants = cva(
  "flex size-11 shrink-0 items-center justify-center transition-colors",
  {
    variants: {
      tone: {
        default:
          "bg-store-contrast text-store-background group-hover:bg-store-accent group-hover:text-store-foreground",
        contrast:
          "bg-store-accent text-store-foreground group-hover:bg-store-background",
      },
    },
  }
);

export type StoreArrowLinkProps = ComponentProps<typeof Link> &
  VariantProps<typeof storeArrowLinkVariants>;

/**
 * A storefront link that leads somewhere else in the store, with its arrow.
 * The caller builds `href` with `localizePath()`.
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
      <span
        aria-hidden="true"
        className={arrowBoxVariants({ tone })}
        data-slot="store-arrow-link-arrow"
      >
        <ArrowRight className="size-5 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

export { StoreArrowLink, storeArrowLinkVariants };
