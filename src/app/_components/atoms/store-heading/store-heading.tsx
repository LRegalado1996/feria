import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentProps, Fragment } from "react";

import { cn } from "@/lib/utils";

const storeHeadingVariants = cva(
  "font-display leading-display font-normal tracking-display uppercase",
  {
    variants: {
      size: {
        hero: "store-display-hero",
        section: "store-display-section",
        title: "store-display-title",
      },
    },
    defaultVariants: { size: "section" },
  }
);

// Each line starts a beat after the one above it.
const LINE_STAGGER_MS = 80;

export type StoreHeadingProps = Omit<ComponentProps<"h2">, "children"> &
  VariantProps<typeof storeHeadingVariants> & {
    /** The line set in the accent color. Only on a contrast block: the accent
     *  is not readable as text on the light background. */
    accentLine?: number;
    as?: "h1" | "h2" | "h3";
    /** One entry per line; the lines are distinct, they key the list. */
    lines: readonly string[];
  };

/**
 * A storefront display heading: condensed, uppercase and tight, broken where
 * the copy says and not where the viewport does. Its lines rise into place
 * one after another, from CSS alone, so the text is in the server's HTML and
 * reads without JavaScript; under reduced motion they are simply there.
 *
 * The rise plays when the page loads, so it is seen in the first viewport.
 * Below the fold, put the heading inside a `StoreReveal`: a waiting block
 * holds its heading's lines still and the rise plays when the block scrolls
 * in (the rule is in globals.css). Left bare below the fold, the heading is
 * simply in place when the visitor reaches it.
 */
function StoreHeading({
  accentLine,
  as: Tag = "h2",
  className,
  lines,
  size = "section",
  ...props
}: StoreHeadingProps) {
  return (
    <Tag
      className={cn(storeHeadingVariants({ size }), className)}
      data-size={size}
      data-slot="store-heading"
      {...props}
    >
      {lines.map((line, index) => (
        <Fragment key={line}>
          {/* The lines are blocks, which a screen reader does not always
              separate: the space keeps "en" from fusing with "vemos". */}
          {index > 0 ? " " : null}
          <span
            // The mask the line rises from. Its padding leaves room for an
            // accent on a capital (É), which the tight line height cuts off.
            className="-mt-[0.14em] block overflow-y-clip pt-[0.14em]"
            data-slot="store-heading-line"
          >
            <span
              className={cn(
                "block motion-safe:animate-store-line",
                index === accentLine && "text-store-accent"
              )}
              data-slot="store-heading-line-text"
              style={{ animationDelay: `${index * LINE_STAGGER_MS}ms` }}
            >
              {line}
            </span>
          </span>
        </Fragment>
      ))}
    </Tag>
  );
}

export { StoreHeading, storeHeadingVariants };
