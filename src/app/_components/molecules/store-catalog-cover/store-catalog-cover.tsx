import type { ReactNode } from "react";

import { StorePicture } from "@/app/_components/atoms/store-picture";
import { STORE_COVER_HEIGHT } from "@/app/_components/molecules/store-banner";
import type { CatalogCover } from "@/lib/catalog/cover";
import { cn } from "@/lib/utils";

export interface StoreCatalogCoverProps {
  /** What sits on the photo's bottom-left corner: the page's `h1`. */
  children: ReactNode;
  className?: string;
  cover: CatalogCover;
}

/**
 * A catalog page's cover (FER-043, FER-044), after the collection pages of
 * the reference store: a photo the whole width of the window, right under
 * the header, nearly a screen tall, with the page's title over its
 * bottom-left corner. Its height is the window's less what the frame and
 * the page put around it (the bar and the header above; the trail, the
 * filter bar and a hint of the first row of articles below): 17.5rem on a
 * phone, 20rem from `md` up, never under 20rem in all, so a window turned
 * sideways still shows a photo. `svh`, the window with the phone's
 * toolbars shown, so the hint survives them. Art direction
 * (`atoms/store-picture`): the phone image below `md`, the computer image
 * from there up, and on a phone too when there is no phone image. The box
 * has its height before the photo arrives, and the photo is cropped to
 * fill it. It is the page's largest image: fetched first, never lazily.
 * The one gradient the storefront allows rises from the bottom so the
 * white title reads on any photo.
 */
function StoreCatalogCover({
  children,
  className,
  cover,
}: StoreCatalogCoverProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-store-contrast text-store-background",
        STORE_COVER_HEIGHT,
        className
      )}
      data-slot="store-catalog-cover"
      data-testid="store-catalog-cover"
    >
      <StorePicture
        alt={cover.alt}
        computer={cover.computer}
        data-testid="store-catalog-cover-image"
        phone={cover.phone}
        priority
      />
      {/* The one gradient of the storefront: legibility, not decoration. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-store-foreground/75 to-transparent to-60%"
      />
      <div className="absolute inset-x-4 bottom-5.5 md:inset-x-7 md:bottom-7.5">
        {children}
      </div>
    </div>
  );
}

export { StoreCatalogCover };
