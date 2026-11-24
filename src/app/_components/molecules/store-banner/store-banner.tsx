import { cva, type VariantProps } from "class-variance-authority";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { StorePicture } from "@/app/_components/atoms/store-picture";
import type { CoverImage } from "@/lib/catalog/cover";
import { cn } from "@/lib/utils";

/**
 * A cover's height (FER-044, FER-022): the window's less what must still
 * show around it (the bar and the header above, a hint of what follows
 * below), 17.5rem on a phone and 20rem from `md` up, never under 20rem in
 * all, for a window turned sideways. `svh`, so a phone's toolbars count. A
 * catalog page's cover and the home's share it.
 */
export const STORE_COVER_HEIGHT =
  "h-[calc(100svh-17.5rem)] min-h-80 md:h-[calc(100svh-20rem)]";

const storeBannerVariants = cva(
  "group relative block w-full overflow-hidden bg-store-contrast text-store-background",
  {
    variants: {
      size: {
        // The home's cover: nearly a screen tall, right under the header.
        cover: STORE_COVER_HEIGHT,
        // Between two rows: the crop the admin's preview shows (FER-020),
        // a tall middle on a phone and a wide strip on a computer.
        row: "h-118 md:h-130",
      },
    },
    defaultVariants: { size: "row" },
  }
);

/**
 * The title's size follows the banner's (FER-075). On the cover it is a
 * caption under the artwork, at a row heading's size and on one line
 * wherever the window fits it; a title longer than the window wraps, even
 * inside a word, and never widens the page. From `md` up it stops 21rem
 * short of the right edge: the corner the cover's carousel keeps for its
 * controls (six 44 px dots and the pause button, 19.5rem), which the old
 * 15ch cap used to clear. Between two rows it is the banner's loud line:
 * big, and capped so it breaks into a short stack.
 */
const storeBannerTitleVariants = cva(
  "font-display leading-display font-extrabold wrap-anywhere uppercase",
  {
    variants: {
      size: {
        cover:
          "max-w-full store-display-section text-balance md:max-w-[calc(100%-21rem)]",
        row: "max-w-[15ch] store-display-banner",
      },
    },
    defaultVariants: { size: "row" },
  }
);

export type StoreBannerProps = VariantProps<typeof storeBannerVariants> & {
  className?: string;
  /**
   * The level its title takes in the page's outline (the home's banners are
   * its sections); without it the title is plain text.
   */
  headingLevel?: "h2" | "h3";
  /**
   * Where it leads, built by the caller with `localizePath()`. Without it
   * (a banner the store gave no link, FER-020) the banner is a picture with
   * its title and no "Comprar ahora".
   */
  href?: string | null;
  /** The computer's photo, and the phone's when it has no crop of its own. */
  image: CoverImage;
  /**
   * The language of its title (and of `shopNow` when the banner has words
   * of its own), when it may differ from the page's.
   */
  lang?: string;
  /** Its phone crop (FER-020), shown below `md`. */
  phoneImage?: CoverImage | null;
  /**
   * The first photo a page shows is its largest: it loads first. Every
   * other banner waits until it is near the screen.
   */
  priority?: boolean;
  /** Its button's words: its own (FER-020) or the page's "Comprar ahora". */
  shopNow: string;
  /** The language of `shopNow`, when it is the banner's own. */
  shopNowLang?: string;
  title: string;
};

/**
 * A full-width photo with its title and "Comprar ahora →" on its bottom-left
 * corner (FER-039), one link to where it leads. The title is big between
 * two rows and a small caption on the cover (FER-075). The photo is decoration: the
 * title says what the link is, so a screen reader hears it once. Nothing
 * shades the photo (FER-077, Lucas): the white words carry a text shadow of
 * the ink instead (`store-display-shadow`). Art direction
 * (`atoms/store-picture`): a phone shows the banner's phone crop when it
 * has one. The box has its height before the photo arrives.
 */
function StoreBanner({
  className,
  headingLevel,
  href,
  image,
  lang,
  phoneImage = null,
  priority = false,
  shopNow,
  shopNowLang,
  size,
  title,
}: StoreBannerProps) {
  const Title = headingLevel ?? "p";
  const content = (
    <>
      <StorePicture
        alt=""
        className="motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out motion-safe:group-hover:scale-102"
        computer={image}
        data-testid="store-banner-photo"
        phone={phoneImage}
        priority={priority}
      />
      {/* No shade over the photo (FER-077): the words carry their own. */}
      <div
        className="absolute inset-x-4 bottom-5.5 flex flex-col items-start store-display-shadow md:inset-x-7 md:bottom-7.5"
        data-slot="store-banner-words"
      >
        <Title
          className={storeBannerTitleVariants({ size })}
          data-slot="store-banner-title"
          lang={lang}
        >
          {title}
        </Title>
        {href ? (
          <span
            className="mt-3 inline-flex min-h-6 items-center gap-2 font-display text-xs font-extrabold uppercase underline-offset-6 group-hover:underline md:mt-4"
            data-slot="store-banner-cta"
            lang={shopNowLang}
          >
            {shopNow}
            <ArrowRight
              aria-hidden="true"
              className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
            />
          </span>
        ) : null}
      </div>
    </>
  );
  const classes = storeBannerVariants({ size });

  return href ? (
    <Link
      className={cn(
        classes,
        "focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-store-accent",
        className
      )}
      data-size={size ?? "row"}
      data-slot="store-banner"
      href={href}
    >
      {content}
    </Link>
  ) : (
    <div
      className={cn(classes, className)}
      data-size={size ?? "row"}
      data-slot="store-banner"
    >
      {content}
    </div>
  );
}

export { StoreBanner };
