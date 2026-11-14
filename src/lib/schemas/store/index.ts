import { z } from "zod";

import { LOCALES } from "@/lib/i18n/config";
import { contrastRatio, mixSrgb } from "@/lib/utils/contrast";
import type { Currency } from "@/lib/utils/format";

export const STORE_SLUG_MIN_LENGTH = 2;
export const STORE_SLUG_MAX_LENGTH = 40;

/**
 * Lowercase letters and digits in groups joined by single hyphens. The
 * database check is built from this same pattern, so it stays inside what both
 * JavaScript and Postgres read the same way. No underscore and no dot: that
 * alone keeps Next's and Vercel's own paths (`_next`, `_vercel`,
 * `favicon.ico`) from ever being a store.
 */
export const STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * First path segments the app answers itself, which the slug pattern would
 * otherwise allow: a store named after one would never be reachable, or would
 * shadow the route. The database refuses the same list
 * (`src/server/db/schema/store.ts`); add a top-level route here in the change
 * that creates it.
 */
export const RESERVED_STORE_SLUGS = [
  "admin",
  "api",
  "design",
  "en",
  "es",
  // The Sentry tunnel (`src/proxy.ts`).
  "monitoring",
] as const;

/** The currencies a store can sell in, pesos first. */
export const STORE_CURRENCIES = [
  "UYU",
  "USD",
] as const satisfies readonly Currency[];

/** How a color is stored: `#` and six lowercase hex digits. */
export const STORE_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

export const STORE_NAME_MAX_LENGTH = 80;
export const STORE_TAGLINE_MAX_LENGTH = 120;
export const STORE_DESCRIPTION_MAX_LENGTH = 600;

const URL_MAX_LENGTH = 2048;

/** WCAG 2.x AA: 4.5:1 for text, 3:1 for large text. */
const AA_TEXT = 4.5;
const AA_LARGE_TEXT = 3;

function isReservedStoreSlug(slug: string): boolean {
  return RESERVED_STORE_SLUGS.some((reserved) => reserved === slug);
}

/**
 * A store's address: the first segment of every one of its URLs. Nothing is
 * rewritten on the way in: an uppercase letter is refused, never lowered, so
 * the address that was typed is the address that is stored.
 */
export const storeSlugSchema = z
  .string()
  .min(
    STORE_SLUG_MIN_LENGTH,
    `The address needs at least ${STORE_SLUG_MIN_LENGTH} characters`
  )
  .max(
    STORE_SLUG_MAX_LENGTH,
    `Keep the address to ${STORE_SLUG_MAX_LENGTH} characters`
  )
  .regex(
    STORE_SLUG_PATTERN,
    "Use lowercase letters, numbers and single hyphens, such as my-store"
  )
  .refine((slug) => !isReservedStoreSlug(slug), {
    error: "That address is reserved by the app. Choose another one",
  });

/** Uppercase digits are the same color, so they are stored in lowercase. */
const storeColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    STORE_COLOR_PATTERN,
    "Write the color as # followed by six hex digits (0 to 9, a to f)"
  );

/**
 * A link the storefront renders as an `href`: `https` only, so a stored value
 * can never be a `javascript:` URL.
 */
const storeLinkSchema = z
  .url({ error: "Enter a full https:// link", protocol: /^https$/ })
  .max(URL_MAX_LENGTH, `Keep the link to ${URL_MAX_LENGTH} characters`)
  .nullable();

const storePaletteSchema = z.object({
  colorAccent: storeColorSchema,
  colorBackground: storeColorSchema,
  colorContrast: storeColorSchema,
  colorForeground: storeColorSchema,
  colorSurface: storeColorSchema,
});

type StorePalette = z.infer<typeof storePaletteSchema>;

type PaletteColor = keyof StorePalette;

/**
 * Every pair of store colors the storefront sets text in (design.md
 * § Storefront), with the ratio AA asks of it. `field` is the color the
 * message is attached to: the one a person would change to fix the pair. The
 * last two are the muted colors CSS derives from the five with `color-mix()`,
 * at the same percentages as `src/styles/globals.css`.
 */
const CONTRAST_RULES: readonly {
  colors: (palette: StorePalette) => readonly [string, string];
  field: PaletteColor;
  label: string;
  minimum: number;
}[] = [
  {
    colors: (p) => [p.colorForeground, p.colorBackground],
    field: "colorForeground",
    label: "The text color on the background color",
    minimum: AA_TEXT,
  },
  {
    colors: (p) => [p.colorForeground, p.colorSurface],
    field: "colorSurface",
    label: "The text color on the surface color",
    minimum: AA_TEXT,
  },
  {
    colors: (p) => [p.colorForeground, p.colorAccent],
    field: "colorAccent",
    label: "The text color on the accent color",
    minimum: AA_TEXT,
  },
  {
    colors: (p) => [p.colorBackground, p.colorContrast],
    field: "colorContrast",
    label: "The background color, as text on the contrast color",
    minimum: AA_TEXT,
  },
  {
    // Display headings only, which are large text.
    colors: (p) => [p.colorAccent, p.colorContrast],
    field: "colorAccent",
    label: "The accent color, as a heading on the contrast color",
    minimum: AA_LARGE_TEXT,
  },
  {
    colors: (p) => [
      mixSrgb(p.colorForeground, p.colorBackground, 68),
      p.colorBackground,
    ],
    field: "colorForeground",
    label: "The small muted text on the background color",
    minimum: AA_TEXT,
  },
  {
    colors: (p) => [
      mixSrgb(p.colorBackground, p.colorContrast, 74),
      p.colorContrast,
    ],
    field: "colorContrast",
    label: "The small muted text on the contrast color",
    minimum: AA_TEXT,
  },
];

/** Truncated, never rounded: 4.49 must not read as the 4.5 it failed to reach. */
function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2);
}

const storeTranslationSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "A description is required")
    .max(
      STORE_DESCRIPTION_MAX_LENGTH,
      `Keep the description to ${STORE_DESCRIPTION_MAX_LENGTH} characters`
    ),
  locale: z.enum(LOCALES),
  tagline: z
    .string()
    .trim()
    .min(1, "A tagline is required")
    .max(
      STORE_TAGLINE_MAX_LENGTH,
      `Keep the tagline to ${STORE_TAGLINE_MAX_LENGTH} characters`
    ),
});

/**
 * Everything a store holds that a person can set. Writing a store always
 * sends all of it: the five colors only make sense together (their contrast
 * is checked as pairs), and a partial update would have to merge with a row
 * read earlier.
 */
const storeFieldsSchema = storePaletteSchema.extend({
  currencyCode: z.enum(STORE_CURRENCIES),
  instagramUrl: storeLinkSchema,
  isActive: z.boolean(),
  logoUrl: storeLinkSchema,
  // Trimmed first: `min(1)` alone accepts "   ".
  name: z
    .string()
    .trim()
    .min(1, "A name is required")
    .max(
      STORE_NAME_MAX_LENGTH,
      `Keep the name to ${STORE_NAME_MAX_LENGTH} characters`
    ),
  slug: storeSlugSchema,
  tiktokUrl: storeLinkSchema,
  // At most one text per language; a store may have none yet.
  translations: z
    .array(storeTranslationSchema)
    .max(LOCALES.length, "Send each language at most once")
    .refine(
      (translations) =>
        new Set(translations.map(({ locale }) => locale)).size ===
        translations.length,
      { error: "Send each language at most once" }
    ),
  // E.164, the format WhatsApp links take: a plus, the country code, digits.
  whatsappNumber: z
    .string()
    .trim()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Write the number in international format, such as +59899123456"
    )
    .nullable(),
});

/**
 * Refuses a palette whose text could not be read. zod runs an object's
 * refinements even when a field failed, so a color that did not parse is left
 * to its own message: the contrast helpers only ever see five valid colors.
 */
function checkPaletteContrast(
  input: StorePalette,
  context: z.RefinementCtx
): void {
  const palette = storePaletteSchema.safeParse(input);

  if (!palette.success) {
    return;
  }

  for (const { colors, field, label, minimum } of CONTRAST_RULES) {
    const ratio = contrastRatio(...colors(palette.data));

    if (ratio < minimum) {
      context.addIssue({
        code: "custom",
        message: `${label} has a contrast of ${formatRatio(ratio)}:1. It needs at least ${minimum}:1 to be readable`,
        path: [field],
      });
    }
  }
}

export const createStoreSchema =
  storeFieldsSchema.superRefine(checkPaletteContrast);

export type CreateStoreValues = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = storeFieldsSchema
  .extend({
    // Coerced: the REST surface reads it from the path.
    id: z.coerce.number().int().positive(),
  })
  .superRefine(checkPaletteContrast);

export type UpdateStoreValues = z.infer<typeof updateStoreSchema>;

export const getStoreBySlugSchema = z.object({ slug: storeSlugSchema });

export type GetStoreBySlugValues = z.infer<typeof getStoreBySlugSchema>;
