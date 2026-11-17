import { LocaleToggle } from "@/app/_components/molecules/locale-toggle";
import { cn } from "@/lib/utils";

export interface StoreLocaleToggleProps {
  className?: string;
}

/**
 * The language pill on the moss (FER-039), in the header, its phone menu
 * and the coming-soon screen: a lime hairline capsule, a lime thumb under
 * the current language with its code in ink, the other code in lime. The
 * codes in the display face, like the header's links. The app's link, which
 * keeps the path and the query string, drawn with the store's tokens; a
 * 44 px target, focus the storefront's 3 px outline in lime, on the capsule.
 */
function StoreLocaleToggle({ className }: StoreLocaleToggleProps) {
  return (
    <LocaleToggle
      className={cn("min-h-11 px-1", className)}
      classNames={{
        code: "font-display text-xs font-extrabold data-[state=off]:text-store-accent data-[state=on]:text-store-foreground",
        thumb: "bg-store-accent",
        track:
          "border border-store-accent transition-colors group-hover:bg-store-accent/15 group-focus-visible:outline-3 group-focus-visible:outline-offset-2 group-focus-visible:outline-store-accent",
      }}
      tone="bare"
    />
  );
}

export { StoreLocaleToggle };
