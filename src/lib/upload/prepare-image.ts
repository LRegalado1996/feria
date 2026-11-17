import { IMAGE_MAX_SIDE } from "@/lib/schemas/upload";

/** The browser could not decode the file: not an image it knows. */
export class UnreadableImageError extends Error {
  constructor(options?: ErrorOptions) {
    super("The browser cannot read this image", options);
    this.name = "UnreadableImageError";
  }
}

/** A photo ready to travel: re-encoded, never larger than the cap. */
export interface PreparedImage {
  blob: Blob;
  contentType: "image/jpeg" | "image/webp";
  height: number;
  width: number;
}

/** Quality for both encoders: no visible loss on a photo, a third of the bytes. */
const QUALITY = 0.85;

async function encode(
  canvas: HTMLCanvasElement,
  type: PreparedImage["contentType"]
): Promise<Blob | null> {
  return await new Promise((resolve) => {
    canvas.toBlob(resolve, type, QUALITY);
  });
}

/**
 * Downscales a photo in the browser before it is uploaded (FER-011), so a
 * 12 MB picture from a phone does not cross mobile data whole: its longest
 * side becomes at most `maxSide` pixels (never larger than it was), drawn
 * upright as the camera meant it, then re-encoded as WebP, or as JPEG where
 * the browser cannot write WebP (Safari answers PNG when asked). Re-encoding
 * also drops the file's metadata, the place it was taken included.
 *
 * Whatever the browser can decode is accepted, so an iPhone's HEIC works
 * where Safari reads it; elsewhere the picker hands over a JPEG already.
 * A file it cannot decode throws `UnreadableImageError`.
 */
export async function prepareImage(
  file: Blob,
  { maxSide = IMAGE_MAX_SIDE }: { maxSide?: number } = {}
): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  }).catch((error: unknown) => {
    throw new UnreadableImageError({ cause: error });
  });

  try {
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

    // A transparent PNG turns black in a JPEG; white is what it showed on.
    context.fillStyle = "white";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    const webp = await encode(canvas, "image/webp");

    if (webp?.type === "image/webp") {
      return { blob: webp, contentType: "image/webp", height, width };
    }

    const jpeg = await encode(canvas, "image/jpeg");

    if (jpeg?.type !== "image/jpeg") {
      throw new Error("The browser could not encode the image");
    }

    return { blob: jpeg, contentType: "image/jpeg", height, width };
  } finally {
    bitmap.close();
  }
}
