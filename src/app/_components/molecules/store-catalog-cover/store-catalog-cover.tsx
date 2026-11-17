import { getImageProps } from "next/image";
import type { ReactNode } from "react";

import type { CatalogCover } from "@/lib/catalog/cover";
import { cn } from "@/lib/utils";

export interface StoreCatalogCoverProps {
  /** What sits on the photo's bottom-left corner: the page's `h1`. */
  children: ReactNode;
  className?: string;
  cover: CatalogCover;
}

/** The phone's image below `md` (768 px), the computer's from there up. */
const COMPUTER_MEDIA = "(min-width: 768px)";

/**
 * A catalog page's cover (FER-043), after the collection pages of the
 * reference store: a full-width photo with the page's title over its
 * bottom-left corner. Art direction: a `<picture>` whose phone image shows
 * below `md` and whose computer image shows from there up, and on a phone
 * too when there is no phone image. The box keeps its own proportions (4:5
 * on a phone, 12:5 on a computer), so the space is reserved before the
 * photo arrives and the photo is cropped to fill it. It is the page's
 * largest image: fetched first, never lazily. The one gradient the
 * storefront allows rises from the bottom so the white title reads on any
 * photo.
 */
function StoreCatalogCover({
  children,
  className,
  cover,
}: StoreCatalogCoverProps) {
  const common = {
    alt: cover.alt,
    fetchPriority: "high",
    loading: "eager",
    sizes: "100vw",
  } as const;
  const {
    props: { srcSet: computer },
  } = getImageProps({
    ...common,
    height: cover.computer.height,
    src: cover.computer.url,
    width: cover.computer.width,
  });
  const phone = cover.phone ?? cover.computer;
  const { props: image } = getImageProps({
    ...common,
    height: phone.height,
    src: phone.url,
    width: phone.width,
  });

  return (
    <div
      className={cn(
        "relative aspect-4/5 w-full overflow-hidden bg-store-contrast text-store-background md:aspect-12/5",
        className
      )}
      data-slot="store-catalog-cover"
      data-testid="store-catalog-cover"
    >
      <picture>
        {cover.phone ? (
          <source media={COMPUTER_MEDIA} srcSet={computer} />
        ) : null}
        {/* Its props are next/image's own, made by `getImageProps`. */}
        <img
          {...image}
          alt={cover.alt}
          className="absolute inset-0 size-full object-cover"
          data-testid="store-catalog-cover-image"
        />
      </picture>
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
