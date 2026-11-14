import type { ComponentProps } from "react";

import { StoreEyebrow } from "@/app/_components/atoms/store-eyebrow";
import { StoreHeading } from "@/app/_components/atoms/store-heading";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type StoreIntroProps = Omit<ComponentProps<"div">, "children"> & {
  name: string;
  /**
   * The store's own words, and the language they are in: it can be another
   * one than the page's when the store has not written this one yet, and a
   * screen reader must pronounce it as what it is. `null` when the store has
   * written nothing.
   */
  text: { description: string; locale: Locale; tagline: string } | null;
};

const CONTAINER_CLASS = "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4";

/**
 * A store introducing itself in its own colors: its name as the page's `h1`
 * on the contrast block, under its tagline, and its description on a surface.
 * What a store's home shows until it has its real sections (FER-022).
 */
function StoreIntro({ className, name, text, ...props }: StoreIntroProps) {
  return (
    <div
      className={cn("flex flex-col", className)}
      data-slot="store-intro"
      {...props}
    >
      <header
        className="bg-store-contrast py-12 md:py-20"
        data-slot="store-intro-header"
        data-testid="store-header"
      >
        <div className={CONTAINER_CLASS}>
          {text ? (
            <StoreEyebrow lang={text.locale} tone="contrast">
              {text.tagline}
            </StoreEyebrow>
          ) : null}
          <StoreHeading
            accentLine={0}
            as="h1"
            // A long name wraps inside a narrow phone instead of widening it.
            className="wrap-anywhere"
            lines={[name]}
            size="hero"
          />
        </div>
      </header>

      {text ? (
        <section className={cn(CONTAINER_CLASS, "py-12")}>
          <p
            className="max-w-prose bg-store-surface p-6 text-base md:p-10"
            data-slot="store-intro-description"
            data-testid="store-description"
            lang={text.locale}
          >
            {text.description}
          </p>
        </section>
      ) : null}
    </div>
  );
}

export { StoreIntro };
