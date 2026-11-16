import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { contrastRatio, mixSrgb } from "@/lib/utils/contrast";

import { STORE_THEME, storeThemeStyle } from "./theme";

const GLOBALS_CSS = readFileSync(
  path.join(process.cwd(), "src/styles/globals.css"),
  "utf-8"
);

/** WCAG 2.x AA: 4.5:1 for text, 3:1 for large text. */
const AA_TEXT = 4.5;
const AA_LARGE_TEXT = 3;

/**
 * The three colors CSS derives from the five with `color-mix()`: how much of
 * the first one each mixes into the second (`src/styles/globals.css`).
 */
const DERIVED = {
  "contrast-muted": { base: "contrast", color: "background", percent: 74 },
  line: { base: "background", color: "foreground", percent: 11 },
  muted: { base: "background", color: "foreground", percent: 68 },
} as const;

function derived(name: keyof typeof DERIVED): string {
  const { base, color, percent } = DERIVED[name];

  return mixSrgb(STORE_THEME[color], STORE_THEME[base], percent);
}

/**
 * Every pair of colors the storefront sets text in (design.md § Storefront),
 * with the ratio AA asks of it: the rules the store's settings enforced while
 * the colors were data, held now over the file that replaced them.
 */
const CONTRAST_RULES = [
  [
    "the text on the background",
    STORE_THEME.foreground,
    STORE_THEME.background,
    AA_TEXT,
  ],
  [
    "the text on the surface",
    STORE_THEME.foreground,
    STORE_THEME.surface,
    AA_TEXT,
  ],
  [
    "the text on the accent",
    STORE_THEME.foreground,
    STORE_THEME.accent,
    AA_TEXT,
  ],
  [
    "the background as text on the contrast",
    STORE_THEME.background,
    STORE_THEME.contrast,
    AA_TEXT,
  ],
  // Display headings only, which are large text.
  [
    "the accent as a heading on the contrast",
    STORE_THEME.accent,
    STORE_THEME.contrast,
    AA_LARGE_TEXT,
  ],
  [
    "the small muted text on the background",
    derived("muted"),
    STORE_THEME.background,
    AA_TEXT,
  ],
  [
    "the small muted text on the surface",
    derived("muted"),
    STORE_THEME.surface,
    AA_TEXT,
  ],
  [
    "the small muted text on the placeholder behind a missing photo",
    derived("muted"),
    derived("line"),
    AA_TEXT,
  ],
  [
    "the small muted text on the contrast",
    derived("contrast-muted"),
    STORE_THEME.contrast,
    AA_TEXT,
  ],
] as const;

describe("STORE_THEME", () => {
  test("names the five colors, each # and six lowercase hex digits", () => {
    expect(Object.keys(STORE_THEME)).toEqual([
      "background",
      "surface",
      "foreground",
      "contrast",
      "accent",
    ]);

    for (const color of Object.values(STORE_THEME)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/u);
    }
  });

  test.each(CONTRAST_RULES)(
    "%s is readable: %s on %s reaches %s:1",
    (_label, text, behind, minimum) => {
      expect(contrastRatio(text, behind)).toBeGreaterThanOrEqual(minimum);
    }
  );

  test.each(Object.entries(DERIVED))(
    "globals.css derives --store-%s as the rules above do",
    (name, { base, color, percent }) => {
      expect(GLOBALS_CSS).toMatch(
        new RegExp(
          `--store-${name}: color-mix\\(\\s*in srgb,\\s*var\\(--store-${color}\\) ${percent}%,\\s*var\\(--store-${base}\\)\\s*\\)`,
          "u"
        )
      );
    }
  );

  test("is the only place the five are written: globals.css declares none of them", () => {
    expect(GLOBALS_CSS).not.toMatch(
      /--store-(?:accent|background|contrast|foreground|surface):/u
    );
  });
});

describe("storeThemeStyle", () => {
  test("writes each color into its --store-* variable", () => {
    expect(storeThemeStyle()).toEqual({
      "--store-accent": "#c8f31d",
      "--store-background": "#f2f3f0",
      "--store-contrast": "#111312",
      "--store-foreground": "#111312",
      "--store-surface": "#ffffff",
    });
  });
});
