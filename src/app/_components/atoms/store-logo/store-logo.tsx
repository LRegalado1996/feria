import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import {
  BRAND_NAME,
  LOGO_LETTERS,
  LOGO_TAG_PATH,
  LOGO_VIEW_BOX,
  type LogoVariant,
} from "@/lib/brand/logo";
import { cn } from "@/lib/utils";

const storeLogoTagVariants = cva("", {
  variants: {
    tone: {
      accent: "fill-store-accent",
      contrast: "fill-store-contrast",
    },
  },
  defaultVariants: { tone: "accent" },
});

const storeLogoLettersVariants = cva("", {
  variants: {
    tone: {
      // Foreground on the accent: 14.5:1 with the default palette.
      accent: "fill-store-foreground",
      // The accent as large text on the contrast color: 14.5:1.
      contrast: "fill-store-accent",
    },
  },
  defaultVariants: { tone: "accent" },
});

export type StoreLogoProps = Omit<ComponentProps<"svg">, "children"> &
  VariantProps<typeof storeLogoTagVariants> & {
    /** `mark` drops the name: use it at 48 px tall and under, where it cannot be read. */
    variant?: LogoVariant;
  };

/**
 * The LR Market logo, drawn from `src/lib/brand/logo.ts` in the store tokens.
 * It is an image named after the brand; the caller sets its height.
 */
function StoreLogo({
  className,
  tone = "accent",
  variant = "full",
  ...props
}: StoreLogoProps) {
  return (
    <svg
      aria-label={BRAND_NAME}
      className={cn("block h-24 w-auto shrink-0", className)}
      data-slot="store-logo"
      data-tone={tone}
      data-variant={variant}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline <svg> takes the store tokens, which an <img> of a file cannot; role="img" with a name is how an SVG is announced as one image
      role="img"
      viewBox={LOGO_VIEW_BOX}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        className={storeLogoTagVariants({ tone })}
        d={LOGO_TAG_PATH}
        data-slot="store-logo-tag"
        fillRule="evenodd"
      />
      <g
        className={storeLogoLettersVariants({ tone })}
        data-slot="store-logo-letters"
      >
        {LOGO_LETTERS[variant].map((group) => (
          <g key={group.transform} transform={group.transform}>
            {group.glyphs.map((glyph) => (
              <path
                d={glyph.d}
                fillRule="evenodd"
                key={`${glyph.transform ?? ""}${glyph.d}`}
                transform={glyph.transform}
              />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}

export { StoreLogo };
