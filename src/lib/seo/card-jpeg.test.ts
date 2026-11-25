import path from "node:path";

import sharp from "sharp";
import { describe, expect, test } from "vitest";

import { CARD_JPEG_QUALITY, cardJpeg } from "./card-jpeg";

/**
 * A card-sized PNG: one of the seed's photos, as heavy as a card with a
 * photo is, or a fully transparent one.
 */
async function setup({
  transparent = false,
}: {
  transparent?: boolean;
} = {}) {
  const width = 1200;
  const height = 630;
  const source = transparent
    ? sharp({
        create: {
          background: { alpha: 0, b: 0, g: 0, r: 0 },
          channels: 4,
          height,
          width,
        },
      })
    : sharp(path.join(process.cwd(), "public/seed/ring-3.jpg")).resize(
        width,
        height
      );
  const png = await source.png().toBuffer();
  // The route hands over an ArrayBuffer of exactly the PNG's bytes.
  const bytes = new Uint8Array(png).buffer;

  return { bytes, height, png, width };
}

describe("cardJpeg", () => {
  test("answers a JPEG of the card's own size, far lighter than its PNG", async () => {
    const { bytes, height, png, width } = await setup();

    const jpeg = await cardJpeg(bytes, "white");
    const read = await sharp(jpeg).metadata();

    expect([read.format, read.width, read.height]).toEqual([
      "jpeg",
      width,
      height,
    ]);
    // A photo as PNG weighs many times its JPEG.
    expect(jpeg.byteLength).toBeLessThan(png.byteLength / 4);
  });

  test("flattens a transparent PNG on the background given, never the black a JPEG would give it", async () => {
    const { bytes } = await setup({ transparent: true });

    const jpeg = await cardJpeg(bytes, "red");
    const { data } = await sharp(jpeg)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Red within a JPEG's rounding, neither black nor white.
    expect(data[0]).toBeGreaterThan(240);
    expect(Math.max(data[1] ?? 255, data[2] ?? 255)).toBeLessThan(20);
  });

  test("keeps a quality that reads sharp text: 82", () => {
    expect(CARD_JPEG_QUALITY).toBe(82);
  });
});
