import { z } from "zod";

/**
 * What an uploaded image is for (FER-011). Each purpose is a folder of the
 * Blob store (`<namespace>/<purpose>/<uuid>.<ext>`) with its own size cap,
 * so the server decides where a file lands and how big it may be. A new
 * consumer adds its purpose here, its cap below and its column to the
 * cleanup's list (`IMAGE_URL_COLUMNS`, `src/server/services/upload.ts`).
 */
export const IMAGE_PURPOSES = ["cover", "product", "banner"] as const;

export type ImagePurpose = (typeof IMAGE_PURPOSES)[number];

/**
 * The only types the store accepts. The browser re-encodes every photo to
 * WebP, or JPEG where it cannot write WebP (`prepareImage`); PNG is allowed
 * for a file that never went through it (the API's REST twin).
 */
export const UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

/**
 * The longest side the browser downscales a photo to before it travels:
 * twice a wide desktop banner's CSS width, enough for a sharp cover on a
 * high-density screen. A stored image is never larger.
 */
export const IMAGE_MAX_SIDE = 2400;

/**
 * Bytes per purpose. A 2400 px photo re-encoded at the browser's quality is
 * well under 3 MB; a 12 MB original from a phone never reaches the store.
 * An article's photo (FER-017) is shown smaller than a page's cover and an
 * article holds up to eight, so its cap is tighter; it still leaves room for
 * the JPEG a phone's Safari writes where it cannot write WebP. A home
 * banner (FER-020) is as wide as a page's cover, so it takes the cover's.
 */
export const IMAGE_PURPOSE_MAX_BYTES = {
  banner: 5_000_000,
  cover: 5_000_000,
  product: 4_000_000,
} as const satisfies Record<ImagePurpose, number>;

/**
 * The largest file the browser agrees to prepare at all (FER-017): a phone's
 * photo is a few megabytes, so anything past this is refused at once, with
 * its reason, before it is decoded. What travels is the prepared photo,
 * held to its purpose's cap above.
 */
export const IMAGE_SOURCE_MAX_BYTES = 25_000_000;

/** How long a client token lets the browser upload: a slow connection's minutes. */
export const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;

/**
 * A request for a client token: the file's purpose, type and size, as the
 * browser is about to send it. The server refuses anything outside the
 * limits before signing, and signs the type and the size into the token, so
 * the Blob store refuses a file that differs from what was declared.
 */
export const createUploadTokenSchema = z
  .object({
    contentType: z.enum(UPLOAD_CONTENT_TYPES),
    purpose: z.enum(IMAGE_PURPOSES),
    size: z.number().int().positive(),
  })
  .superRefine((value, context) => {
    if (value.size > IMAGE_PURPOSE_MAX_BYTES[value.purpose]) {
      context.addIssue({
        code: "custom",
        message: "The image is larger than its purpose allows",
        path: ["size"],
      });
    }
  });

export type CreateUploadTokenValues = z.infer<typeof createUploadTokenSchema>;

const imageSideSchema = z.number().int().min(1).max(IMAGE_MAX_SIDE);

/**
 * An uploaded image as a form sends it to be stored: its address in the
 * Blob store and its size in pixels, so a page reserves its space before it
 * loads. The server also checks the address is one of its own uploads for
 * the purpose (`isOwnBlobUrl`); the schema only bounds the shape, and keeps
 * the address as a URL writes it (`HTTPS://Store9…` is `https://store9…`),
 * the form the orphan cleanup reads.
 */
export const uploadedImageSchema = z.object({
  height: imageSideSchema,
  url: z.url({ normalize: true, protocol: /^https$/ }).max(500),
  width: imageSideSchema,
});

export type UploadedImage = z.infer<typeof uploadedImageSchema>;
