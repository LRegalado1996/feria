import { LocaleToggle } from "@/app/_components/molecules/locale-toggle";
import { cn } from "@/lib/utils";

export interface StoreLocaleToggleProps {
  className?: string;
}

/**
 * The language link in the header's colors (FER-039): the accent on the
 * moss, in the display face, like the header's other links. It is the app's
 * link, which keeps the path and the query string, without its button.
 */
function StoreLocaleToggle({ className }: StoreLocaleToggleProps) {
  return (
    <LocaleToggle
      className={cn(
        "inline-flex min-h-11 items-center px-2.5 font-display text-xs font-extrabold text-store-accent uppercase underline-offset-6 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent",
        className
      )}
      tone="bare"
    />
  );
}

export { StoreLocaleToggle };
