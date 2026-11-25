import sharp from "sharp";

/** Sharp text and a clean photo at about a tenth of the PNG's weight. */
export const CARD_JPEG_QUALITY = 82;

/**
 * A share card's PNG as a JPEG (FER-049). The card's renderer only writes
 * PNG, and a card with a photo weighs 600 to 800 KB that way: WhatsApp
 * shows no image for a card that heavy (the one that showed weighed 585 KB,
 * the ones that did not over 800), while the same card as a JPEG is about
 * 60 KB. A PNG's transparent pixels would turn black in a JPEG, so the card
 * is flattened on `background` first, the card's own.
 */
export async function cardJpeg(
  png: ArrayBuffer,
  background: string
): Promise<Buffer> {
  return await sharp(png)
    .flatten({ background })
    .jpeg({ mozjpeg: true, quality: CARD_JPEG_QUALITY })
    .toBuffer();
}
