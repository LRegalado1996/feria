import type { ComponentProps, CSSProperties } from "react";

import { cn } from "@/lib/utils";

/** A store's five colors, each `#` and six hex digits. */
export interface StoreThemePalette {
  accent: string;
  background: string;
  contrast: string;
  foreground: string;
  surface: string;
}

export type StoreThemeProps = Omit<ComponentProps<"div">, "style"> & {
  palette: StoreThemePalette;
};

type PaletteStyle = CSSProperties &
  Record<`--store-${string}`, string | undefined>;

/**
 * Everything inside wears one store's colors: the five storefront tokens are
 * overridden here, on one element, and the page is painted in the store's
 * background. This is the only place a color comes from data instead of a
 * token (design.md § Storefront). The values are a store's columns, validated
 * as hex colors by the schema and again by a database check when they were
 * stored, so nothing else can reach this `style`.
 */
function StoreTheme({ className, palette, ...props }: StoreThemeProps) {
  const style: PaletteStyle = {
    "--store-accent": palette.accent,
    "--store-background": palette.background,
    "--store-contrast": palette.contrast,
    "--store-foreground": palette.foreground,
    "--store-surface": palette.surface,
  };

  return (
    <div
      className={cn(
        "min-h-screen bg-store-background text-store-foreground",
        className
      )}
      data-slot="store-theme"
      // The muted colors are derived from the five; this attribute makes CSS
      // compute them again from this store's values.
      data-store-palette=""
      style={style}
      {...props}
    />
  );
}

export { StoreTheme };
