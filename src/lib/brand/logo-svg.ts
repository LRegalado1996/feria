import { STORE_PALETTE } from "@/styles/store-palette";

import {
  BRAND_NAME,
  LOGO_BOX,
  LOGO_LETTERS,
  LOGO_TAG_PATH,
  LOGO_VIEW_BOX,
  type LogoVariant,
} from "./logo";

/**
 * How a standalone logo file is colored. The two-color ones swap the accent
 * and the ink; the one-color ones are a single ink with the letters cut out,
 * so whatever is behind the file shows through them.
 */
export type LogoColorway =
  | "accent"
  | "contrast"
  | "one-color-dark"
  | "one-color-light";

export interface LogoSvgOptions {
  colorway: LogoColorway;
  variant: LogoVariant;
}

function letterPaths(variant: LogoVariant): string {
  return LOGO_LETTERS[variant]
    .map(({ glyphs, transform }) => {
      const paths = glyphs
        .map(
          (glyph) =>
            `<path d="${glyph.d}" fill-rule="evenodd"${
              glyph.transform === undefined
                ? ""
                : ` transform="${glyph.transform}"`
            }/>`
        )
        .join("");

      return `<g transform="${transform}">${paths}</g>`;
    })
    .join("");
}

function tagPath(fill: string, mask = ""): string {
  return `<path d="${LOGO_TAG_PATH}" fill="${fill}" fill-rule="evenodd"${mask}/>`;
}

const TWO_COLOR_FILLS = {
  accent: { letters: STORE_PALETTE.foreground, tag: STORE_PALETTE.accent },
  contrast: { letters: STORE_PALETTE.accent, tag: STORE_PALETTE.foreground },
} as const;

const ONE_COLOR_INKS = {
  // Named for the background the file goes on.
  "one-color-dark": STORE_PALETTE.surface,
  "one-color-light": STORE_PALETTE.foreground,
} as const;

function drawing(variant: LogoVariant, colorway: LogoColorway): string {
  const letters = letterPaths(variant);

  if (colorway === "accent" || colorway === "contrast") {
    const fills = TWO_COLOR_FILLS[colorway];

    return `${tagPath(fills.tag)}<g fill="${fills.letters}">${letters}</g>`;
  }

  // In a luminance mask white keeps and black cuts: the tag stays, the
  // letters become holes.
  const { height, width, x, y } = LOGO_BOX;
  const mask = `<mask id="letters"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white"/><g fill="black">${letters}</g></mask>`;

  return `${mask}${tagPath(ONE_COLOR_INKS[colorway], ' mask="url(#letters)"')}`;
}

/**
 * The logo as a standalone SVG document: what `public/brand/` holds
 * (`pnpm brand:assets` writes the files from this) and what the PNG renderer
 * draws for the app icons and the share card.
 */
export function buildLogoSvg({ colorway, variant }: LogoSvgOptions): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEW_BOX}" width="${LOGO_BOX.width}" height="${LOGO_BOX.height}" role="img" aria-label="${BRAND_NAME}">${drawing(variant, colorway)}</svg>\n`;
}

/** The same document as a `data:` URL, for an `<img>` in the PNG renderer. */
export function buildLogoDataUrl(options: LogoSvgOptions): string {
  return `data:image/svg+xml;base64,${Buffer.from(buildLogoSvg(options)).toString("base64")}`;
}

/** Every file in `public/brand/`, by name. */
export const BRAND_LOGO_FILES: Record<string, LogoSvgOptions> = {
  "lr-market-logo-contrast.svg": { colorway: "contrast", variant: "full" },
  "lr-market-logo-one-color-dark.svg": {
    colorway: "one-color-dark",
    variant: "full",
  },
  "lr-market-logo-one-color-light.svg": {
    colorway: "one-color-light",
    variant: "full",
  },
  "lr-market-logo.svg": { colorway: "accent", variant: "full" },
  "lr-market-mark-contrast.svg": { colorway: "contrast", variant: "mark" },
  "lr-market-mark-one-color-dark.svg": {
    colorway: "one-color-dark",
    variant: "mark",
  },
  "lr-market-mark-one-color-light.svg": {
    colorway: "one-color-light",
    variant: "mark",
  },
  "lr-market-mark.svg": { colorway: "accent", variant: "mark" },
};
