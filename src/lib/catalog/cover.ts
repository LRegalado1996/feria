/** One image of a catalog page's cover, with its size (FER-043). */
export interface CoverImage {
  height: number;
  url: string;
  width: number;
}

/**
 * A catalog page's cover: the computer image, the phone image when there
 * is one (the computer image stands in for it), and what they show.
 */
export interface CatalogCover {
  alt: string;
  computer: CoverImage;
  phone: CoverImage | null;
}

/** An image from its three columns, or `null` when it is not set. */
export function imageOf(
  url: string | null,
  width: number | null,
  height: number | null
): CoverImage | null {
  // The database's checks keep the three together; a row the checks have
  // not seen yet (a mock) is read as no image rather than a broken one.
  return url !== null && width !== null && height !== null
    ? { height, url, width }
    : null;
}

/**
 * A page's cover from its two images and its alt text, or `null` without
 * a computer image. Without an alt text of its own, the cover is described
 * by `fallbackAlt`, the page's name.
 */
export function coverOf(
  images: { computer: CoverImage | null; phone: CoverImage | null },
  alt: string | null,
  fallbackAlt: string
): CatalogCover | null {
  return images.computer
    ? {
        alt: alt?.trim() ? alt : fallbackAlt,
        computer: images.computer,
        phone: images.phone,
      }
    : null;
}
