import { LocaleToggle } from "@/app/_components/molecules/locale-toggle";
import { cn } from "@/lib/utils";

export interface StoreLocaleToggleProps {
  className?: string;
}

/**
 * The language toggle in a store's colors: the same link, which keeps the
 * store, the path and the query string, without the app's button.
 */
function StoreLocaleToggle({ className }: StoreLocaleToggleProps) {
  return (
    <LocaleToggle
      className={cn(
        "inline-flex min-h-11 items-center px-2 text-sm font-semibold text-store-foreground underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground",
        className
      )}
      tone="bare"
    />
  );
}

export { StoreLocaleToggle };
