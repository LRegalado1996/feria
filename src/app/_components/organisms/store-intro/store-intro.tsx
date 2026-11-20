import Link from "next/link";
import type { ComponentProps } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { StoreEyebrow } from "@/app/_components/atoms/store-eyebrow";
import { StoreHeading } from "@/app/_components/atoms/store-heading";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type StoreIntroProps = Omit<ComponentProps<"div">, "children"> & {
  /** The way into the catalog: its words and its address. */
  browse: { href: string; label: string };
  name: string;
  /**
   * The store's own words, and the language they are in: it can be another
   * one than the page's when the store has not written this one yet, and a
   * screen reader must pronounce it as what it is. `null` when the store has
   * written nothing.
   */
  text: { description: string; locale: Locale; tagline: string } | null;
};

/**
 * A store introducing itself on the white page, under the moss header
 * (FER-039): its tagline, its name as the page's `h1` in the wide face, its
 * description and the way into its catalog, the main pill. What the home
 * shows while the store has nothing else to show: no banner and no
 * article published (`organisms/store-home`, FER-022).
 */
function StoreIntro({
  browse,
  className,
  name,
  text,
  ...props
}: StoreIntroProps) {
  return (
    <div
      className={cn("flex flex-col", className)}
      data-slot="store-intro"
      {...props}
    >
      <header
        className="bg-store-background py-14 text-store-foreground md:py-24"
        data-slot="store-intro-header"
        data-testid="store-intro-header"
      >
        <div className="flex flex-col items-start gap-5 px-4 md:px-7">
          {text ? (
            <StoreEyebrow lang={text.locale}>{text.tagline}</StoreEyebrow>
          ) : null}
          <StoreHeading
            as="h1"
            // A long name wraps inside a narrow phone instead of widening it.
            className="wrap-anywhere"
            lines={[name]}
            size="hero"
          />
          {text ? (
            <p
              className="max-w-prose text-base text-store-foreground md:text-lg"
              data-slot="store-intro-description"
              data-testid="store-description"
              lang={text.locale}
            >
              {text.description}
            </p>
          ) : null}
          <StoreButton asChild className="mt-3" size="lg">
            <Link href={browse.href}>{browse.label}</Link>
          </StoreButton>
        </div>
      </header>
    </div>
  );
}

export { StoreIntro };
