/**
 * The default store palette (LR Market's) for surfaces that cannot read the
 * app's CSS: the logo files in `public/brand/` and the PNG renderer behind
 * the app icons and the share card. `globals.css` stays the source: a test
 * holds each value here to its `--store-*` token there.
 */
export const STORE_PALETTE = {
  accent: "#c8f31d",
  background: "#f2f3f0",
  foreground: "#111312",
  surface: "#ffffff",
} as const;
