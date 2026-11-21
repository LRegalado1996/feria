import { IMAGE_MAX_SIDE } from "@/lib/schemas/upload";

/** The browser could not decode the file: not an image it knows. */
export class UnreadableImageError extends Error {
  constructor(options?: ErrorOptions) {
    super("The browser cannot read this image", options);
    this.name = "UnreadableImageError";
  }
}

/** A photo ready to travel: re-encoded, its transparency kept. */
export interface PreparedImage {
  blob: Blob;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  height: number;
  width: number;
}

/** Quality for both encoders: no visible loss on a photo, a third of the bytes. */
const QUALITY = 0.85;

/**
 * How many times a transparent PNG is drawn smaller to fit `maxBytes` before
 * it is handed over as it is (and the upload refuses it as too large).
 */
const PNG_SHRINK_ATTEMPTS = 4;

/** What shrinking a PNG aims under its cap, so one more pass is rarely needed. */
const PNG_SHRINK_MARGIN = 0.9;

interface Drawing {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  height: number;
  width: number;
}

async function encode(
  canvas: HTMLCanvasElement,
  type: PreparedImage["contentType"]
): Promise<Blob | null> {
  return await new Promise((resolve) => {
    canvas.toBlob(resolve, type, QUALITY);
  });
}

/** The bitmap drawn on a fresh canvas, its longest side at most `maxSide`. */
function draw(bitmap: ImageBitmap, maxSide: number): Drawing {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("The browser gave no 2D canvas to draw the image on");
  }

  // Nothing is painted under it: a cut-out photo keeps its transparent
  // background (FER-017), which the storefront's grey tile shows through.
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);

  return { canvas, context, height, width };
}

/** Whether any pixel of the drawing is less than fully opaque. */
function hasTransparency({ context, height, width }: Drawing): boolean {
  const { data } = context.getImageData(0, 0, width, height);

  // Every fourth byte is a pixel's alpha.
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] ?? 255) < 255) {
      return true;
    }
  }

  return false;
}

function prepared(
  blob: Blob,
  contentType: PreparedImage["contentType"],
  { height, width }: Drawing
): PreparedImage {
  return { blob, contentType, height, width };
}

/**
 * A transparent image as PNG, where the browser cannot write WebP (Safari):
 * lossless, so a large cut-out can weigh more than `maxBytes`. It is then
 * drawn smaller, in proportion to how far over it is, until it fits.
 */
async function encodePng(
  bitmap: ImageBitmap,
  first: Drawing,
  maxBytes: number
): Promise<PreparedImage> {
  let drawing = first;

  for (let attempt = 0; ; attempt += 1) {
    const png = await encode(drawing.canvas, "image/png");

    if (png?.type !== "image/png") {
      throw new Error("The browser could not encode the image");
    }

    if (png.size <= maxBytes || attempt === PNG_SHRINK_ATTEMPTS) {
      return prepared(png, "image/png", drawing);
    }

    const longest = Math.max(drawing.width, drawing.height);
    drawing = draw(
      bitmap,
      Math.floor(longest * Math.sqrt(maxBytes / png.size) * PNG_SHRINK_MARGIN)
    );
  }
}

/**
 * Downscales a photo in the browser before it is uploaded (FER-011), so a
 * 12 MB picture from a phone does not cross mobile data whole: its longest
 * side becomes at most `maxSide` pixels (never larger than it was), drawn
 * upright as the camera meant it, then re-encoded. Re-encoding also drops
 * the file's metadata, the place it was taken included.
 *
 * An opaque photo becomes WebP, or JPEG where the browser cannot write WebP
 * (Safari answers PNG when asked). An image with transparent pixels (an
 * article's main photo, cut out by hand to sit on the storefront's grey
 * tile, FER-017) keeps them: WebP with its alpha, or PNG where WebP cannot
 * be written, never JPEG, which has no transparency. A PNG over `maxBytes`
 * is drawn smaller until it fits. The pixels are inspected only where WebP
 * cannot be written, and never for a JPEG file, which has no transparency.
 *
 * Whatever the browser can decode is accepted, so an iPhone's HEIC works
 * where Safari reads it; elsewhere the picker hands over a JPEG already.
 * A file it cannot decode throws `UnreadableImageError`.
 */
export async function prepareImage(
  file: Blob,
  {
    maxBytes = Number.POSITIVE_INFINITY,
    maxSide = IMAGE_MAX_SIDE,
  }: { maxBytes?: number; maxSide?: number } = {}
): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  }).catch((error: unknown) => {
    throw new UnreadableImageError({ cause: error });
  });

  try {
    const drawing = draw(bitmap, maxSide);
    const webp = await encode(drawing.canvas, "image/webp");

    // WebP keeps an alpha channel whatever the pixels hold, so they are
    // read (a whole canvas, up to 2400 by 2400) only to choose between
    // PNG and JPEG.
    if (webp?.type === "image/webp") {
      return prepared(webp, "image/webp", drawing);
    }

    if (file.type !== "image/jpeg" && hasTransparency(drawing)) {
      return await encodePng(bitmap, drawing, maxBytes);
    }

    const jpeg = await encode(drawing.canvas, "image/jpeg");

    if (jpeg?.type !== "image/jpeg") {
      throw new Error("The browser could not encode the image");
    }

    return prepared(jpeg, "image/jpeg", drawing);
  } finally {
    bitmap.close();
  }
}
