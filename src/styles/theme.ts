import type { CSSProperties } from "react";

/**
 * The store's colors (FER-038), named: the one file another company edits to
 * make this storefront wear its own. Every surface reads them from here: the
 * storefront's `--store-*` CSS variables, which the root layout writes from
 * `storeThemeStyle()`, and what CSS cannot reach (the share card, the app
 * icons, the logo files in `public/brand/`). `theme.test.ts` holds every pair
 * the storefront sets text in to WCAG AA, so a palette that cannot be read
 * fails before it ships.
 */
export const STORE_THEME = {
  /** The page behind everything. */
  background: "#f2f3f0",
  /** Cards and fields, on the background. */
  surface: "#ffffff",
  /** Text, on the background, the surface and the accent. */
  foreground: "#111312",
  /** The dark blocks (the header, the footer); the background is text on it. */
  contrast: "#111312",
  /** The brand's own color: buttons, prices and headings on the contrast. */
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
