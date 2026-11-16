import type { CSSProperties } from "react";

/**
 * The store's colors (FER-038), named: the one file another company edits to
 * make this storefront wear its own. Every surface reads them from here: the
 * storefront's `--store-*` CSS variables, which the root layout writes from
 * `storeThemeStyle()`, and what CSS cannot reach (the share card, the app
 * icons, the logo files in `public/brand/`). `theme.test.ts` holds every pair
 * the storefront sets text in to WCAG AA, so a palette that cannot be read
 * fails before it ships. LR Market's (FER-039, chosen by Lucas on
 * 2026-11-16): a white page, articles on a light grey tile, a moss header and
 * footer, and its lime.
 */
export const STORE_THEME = {
  /** The page behind everything: white. */
  background: "#ffffff",
  /** The tile behind an article's photo, and other quiet fills on the page. */
  surface: "#f3f3f2",
  /** Text: the ink, on the page, the tile and the accent. */
  foreground: "#15160f",
  /** The dark blocks (the header, the footer, the search panel): moss. */
  contrast: "#262a1d",
  /** The brand's own color: the announcement bar, buttons, and links on the contrast. */
  accent: "#c8f31d",
} as const;

export type StoreThemeColor = keyof typeof STORE_THEME;

type ThemeStyle = CSSProperties & Record<`--store-${StoreThemeColor}`, string>;

/**
 * The five colors as the custom properties the storefront's utilities read
 * (`bg-store-background` is `var(--store-background)`, `src/styles/globals.css`).
 * Constants of this file, never data, so nothing else can reach the `style`
 * they are written into.
 */
export function storeThemeStyle(): ThemeStyle {
  return {
    "--store-accent": STORE_THEME.accent,
    "--store-background": STORE_THEME.background,
    "--store-contrast": STORE_THEME.contrast,
    "--store-foreground": STORE_THEME.foreground,
    "--store-surface": STORE_THEME.surface,
  };
}
