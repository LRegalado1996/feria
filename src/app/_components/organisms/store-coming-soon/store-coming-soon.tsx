import { Suspense } from "react";

import { StoreArrowLink } from "@/app/_components/atoms/store-arrow-link";
import { StoreEyebrow } from "@/app/_components/atoms/store-eyebrow";
import { StoreHeading } from "@/app/_components/atoms/store-heading";
import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { LocaleToggle } from "@/app/_components/molecules/locale-toggle";
import { StoreBubbles } from "@/app/_components/molecules/store-bubbles";
import { StoreFairCountdown } from "@/app/_components/molecules/store-fair-countdown";
import { StoreMarquee } from "@/app/_components/molecules/store-marquee";
import type { Dictionary } from "@/content";
import { BRAND_NAME } from "@/lib/brand/logo";
import { SOCIAL_LINKS } from "@/lib/brand/social";

export interface StoreComingSoonProps {
  /** The page's text, in the language of the URL. */
  copy: Dictionary["comingSoon"];
}

/**
 * The whole coming-soon screen: what every storefront address leads to until
 * the store opens. One composition for a phone and a wide screen: the
 * headline scales, nothing is rearranged.
 */
function StoreComingSoon({ copy: comingSoon }: StoreComingSoonProps) {
  return (
    <div
      className="relative flex min-h-screen flex-col bg-store-contrast text-store-background"
      data-slot="store-coming-soon"
      data-testid="coming-soon-page"
    >
      <header className="flex items-center justify-between gap-4 p-4 md:px-8">
        <StoreBubbles label={comingSoon.bubbles}>
          <StoreLogo className="h-12" variant="mark" />
        </StoreBubbles>
        {/* The toggle is built on the app's tokens, which follow the theme;
            the storefront has one palette, so its colors are set here. */}
        <LocaleToggle className="relative z-10 min-h-11 text-store-background hover:bg-store-background hover:text-store-foreground dark:hover:bg-store-background" />
      </header>

      <main className="relative z-10 flex flex-1 flex-col justify-center gap-8 px-4 py-10 md:px-8">
        <div className="flex flex-col gap-4">
          <StoreEyebrow tone="contrast">{comingSoon.eyebrow}</StoreEyebrow>
          <StoreHeading
            accentLine={1}
            as="h1"
            className="text-store-background"
            lines={[comingSoon.title.lineOne, comingSoon.title.lineTwo]}
            size="hero"
          />
        </div>
        <p className="max-w-prose text-lg">{comingSoon.lead}</p>
        {/* The fallback holds the count's height while it streams in, so
            nothing below it jumps. */}
        <Suspense
          fallback={
            <div className="min-h-24" data-testid="fair-countdown-fallback" />
          }
        >
          <StoreFairCountdown
            className="min-h-24"
            copy={comingSoon.countdown}
          />
        </Suspense>
        <ul className="flex flex-col gap-2 sm:flex-row sm:gap-8">
          <li>
            <StoreArrowLink
              href={SOCIAL_LINKS.instagram}
              rel="noopener noreferrer"
              target="_blank"
              tone="contrast"
            >
              {comingSoon.social.instagram}
            </StoreArrowLink>
          </li>
          <li>
            <StoreArrowLink
              href={SOCIAL_LINKS.tiktok}
              rel="noopener noreferrer"
              target="_blank"
              tone="contrast"
            >
              {comingSoon.social.tiktok}
            </StoreArrowLink>
          </li>
        </ul>
      </main>

      <StoreMarquee
        className="relative z-10"
        items={[
          BRAND_NAME,
          comingSoon.marquee.products,
          comingSoon.marquee.fair,
          comingSoon.marquee.dates,
        ]}
        tone="accent"
      />
    </div>
  );
}

export { StoreComingSoon };
