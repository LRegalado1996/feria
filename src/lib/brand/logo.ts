/**
 * The LR Market logo as data: a price tag holding the monogram, with MARKET
 * under it in the full logo. Every rendering comes from here (the
 * `store-logo` component, the files in `public/brand/`, the app icons and the
 * share card), so the drawing has one source (`docs/brand/brand.md`).
 */

/** The product's name, the same in every language. */
export const BRAND_NAME = "LR Market";

/** `full` carries the name; `mark` is the monogram alone, for 48 px and under. */
export type LogoVariant = "full" | "mark";

/** The drawing's box: the tag plus the clear pixel the artwork was cut with. */
export const LOGO_BOX = { height: 84, width: 116, x: 2, y: 8 } as const;

export const LOGO_VIEW_BOX = `${LOGO_BOX.x} ${LOGO_BOX.y} ${LOGO_BOX.width} ${LOGO_BOX.height}`;

/** The tag, with the hole its string goes through. Filled even-odd. */
export const LOGO_TAG_PATH =
  "M34 12H108A6 6 0 0 1 114 18V82A6 6 0 0 1 108 88H34L6 50ZM36 50A6 6 0 1 0 24 50A6 6 0 1 0 36 50Z";

const LETTER_L = "M12 14H28V70H50V86H12Z";
const LETTER_R =
  "M57 14H80A15 15 0 0 1 95 29V43A15 15 0 0 1 86 56.8L97 86H80L72 62V86H57ZM72 29V45H77A3 3 0 0 0 80 42V32A3 3 0 0 0 77 29Z";

interface LogoGlyph {
  d: string;
  transform?: string;
}

interface LogoGlyphGroup {
  glyphs: readonly LogoGlyph[];
  transform: string;
}

const MONOGRAM: readonly LogoGlyph[] = [{ d: LETTER_L }, { d: LETTER_R }];

/**
 * The letters on the tag, each group placed by its transform. The monogram
 * sits higher and smaller in the full logo to leave room for the name, whose
 * letters are drawn (not set in a font) so the file renders the same anywhere.
 */
export const LOGO_LETTERS: Record<LogoVariant, readonly LogoGlyphGroup[]> = {
  full: [
    { glyphs: MONOGRAM, transform: "translate(44.04 11.38) scale(.58)" },
    {
      glyphs: [
        { d: "M0 0H24L39 52L54 0H78V100H57V42L46 82H32L21 42V100H0Z" },
        {
          d: "M21 0H45L66 100H44L41 80H25L22 100H0ZM28 61H38L33 27Z",
          transform: "translate(87 0)",
        },
        // The monogram's R, stretched to the name's height.
        { d: LETTER_R, transform: "translate(76.5 -19.44) scale(1.5 1.389)" },
        {
          d: "M0 0H22V38L40 0H64L42 44L64 100H40L27 64L22 73V100H0Z",
          transform: "translate(231 0)",
        },
        {
          d: "M0 0H50V20H22V39H44V58H22V80H50V100H0Z",
          transform: "translate(304 0)",
        },
        { d: "M0 0H54V21H38V100H16V21H0Z", transform: "translate(363 0)" },
      ],
      transform: "translate(51 66.8) scale(.11823 .135)",
    },
  ],
  mark: [{ glyphs: MONOGRAM, transform: "translate(42.6 19) scale(.62)" }],
};
