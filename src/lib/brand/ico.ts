const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;
// The format stores a side in one byte, where 0 means 256.
const LARGEST_SIDE = 256;

/**
 * A square PNG wrapped in an ICO file, the format `/favicon.ico` is asked
 * for in: one header, one directory entry, then the PNG as it is (every
 * browser and crawler reads a PNG-compressed icon). `side` is the PNG's
 * width and height in pixels.
 */
export function wrapPngInIco(
  png: Uint8Array,
  side: number
): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(side) || side < 1 || side > LARGEST_SIDE) {
    throw new RangeError(
      `An ICO image is 1 to ${LARGEST_SIDE} px a side, not ${side}`
    );
  }

  const file = new Uint8Array(HEADER_BYTES + ENTRY_BYTES + png.length);
  const view = new DataView(file.buffer);
  const sideByte = side % LARGEST_SIDE;

  // ICONDIR: reserved, type 1 (an icon), one image.
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  // ICONDIRENTRY: width, height, no palette, 1 plane, 32 bits per pixel,
  // the image's length and where it starts.
  view.setUint8(6, sideByte);
  view.setUint8(7, sideByte);
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true);
  view.setUint32(18, HEADER_BYTES + ENTRY_BYTES, true);
  file.set(png, HEADER_BYTES + ENTRY_BYTES);

  return file;
}
