import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type StoreThemeProps = ComponentProps<"div">;

/**
 * The storefront's canvas: everything inside is painted in the store's
 * background and text colors. The colors are the theme file's
 * (`src/styles/theme.ts`), which the root layout writes on <body> (FER-038),
 * so nothing here comes from data or overrides them.
 */
function StoreTheme({ className, ...props }: StoreThemeProps) {
  return (
    <div
      className={cn(
        "min-h-screen bg-store-background text-store-foreground",
        className
      )}
      data-slot="store-theme"
      {...props}
    />
  );
}

export { StoreTheme };
