import { getImageProps } from "next/image";

import type { CoverImage } from "@/lib/catalog/cover";
import { cn } from "@/lib/utils";

export interface StorePictureProps {
  /** `""` when the words around the photo already say what it shows. */
  alt: string;
  /** On the `<img>`, which fills the picture's positioned box. */
  className?: string;
  /** The computer's photo, and the phone's when it has none of its own. */
  computer: CoverImage;
  "data-testid"?: string;
  /** The phone's own crop (FER-020, FER-043), shown below `md`. */
  phone?: CoverImage | null;
  /**
   * The page's largest photo: fetched first, never lazily. Every other one
   * waits until it is near the screen.
   */
  priority?: boolean;
  /** How wide the photo is shown, for the browser to pick a file. */
  sizes?: string;
}

/** The phone's image below `md` (768 px), the computer's from there up. */
export const STORE_PICTURE_COMPUTER_MEDIA = "(min-width: 768px)";

/**
 * A storefront photo with art direction (FER-043, FER-022): a `<picture>`
 * whose phone crop shows below `md` and whose computer photo shows from
 * there up, and everywhere when there is no phone crop. The browser fetches
 * only the one its window picks, the right one even for the page's priority
 * image. It fills its box (`object-cover`): the caller's box has its size
 * before the photo arrives, so nothing shifts. The props are `next/image`'s
 * own, made by `getImageProps`, so the files come from the image optimizer.
 */
function StorePicture({
  alt,
  className,
  computer,
  "data-testid": testId,
  phone = null,
  priority = false,
  sizes = "100vw",
}: StorePictureProps) {
  const common = priority
    ? ({ alt, fetchPriority: "high", loading: "eager", sizes } as const)
    : ({ alt, loading: "lazy", sizes } as const);
  const {
    props: { srcSet: computerSrcSet },
  } = getImageProps({
    ...common,
    height: computer.height,
    src: computer.url,
    width: computer.width,
  });
  const shown = phone ?? computer;
  const { props: image } = getImageProps({
    ...common,
    height: shown.height,
    src: shown.url,
    width: shown.width,
  });

  return (
    <picture data-slot="store-picture">
      {phone ? (
        // A <source> reads its own `sizes` (100vw without one), never the img's.
        <source
          media={STORE_PICTURE_COMPUTER_MEDIA}
          sizes={sizes}
          srcSet={computerSrcSet}
        />
      ) : null}
      <img
        {...image}
        alt={alt}
        className={cn("absolute inset-0 size-full object-cover", className)}
        data-testid={testId}
      />
    </picture>
  );
}

export { StorePicture };
