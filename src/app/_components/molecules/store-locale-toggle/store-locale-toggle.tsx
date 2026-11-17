import {
  LocaleToggle,
  type LocaleToggleClassNames,
} from "@/app/_components/molecules/locale-toggle";
import { cn } from "@/lib/utils";

export interface StoreLocaleToggleProps {
  className?: string;
  /** `page` on the store's background (the header), `contrast` on a dark block. */
  tone?: "page" | "contrast";
}

// The pill in the store's palette: a hairline capsule, the thumb filled under
// the current language, the other code in the capsule's color.
const TONES = {
  contrast: {
    code: "data-[state=off]:text-store-accent data-[state=on]:text-store-foreground",
    thumb: "bg-store-accent",
    track:
      "border border-store-accent group-hover:bg-store-accent/15 group-focus-visible:outline-store-accent",
  },
  page: {
    code: "data-[state=off]:text-store-foreground data-[state=on]:text-store-background",
    thumb: "bg-store-foreground",
    track:
      "border border-store-foreground group-hover:bg-store-surface group-focus-visible:outline-store-foreground",
  },
} as const satisfies Record<
  NonNullable<StoreLocaleToggleProps["tone"]>,
  Required<LocaleToggleClassNames>
>;

/**
 * The language pill in the store's colors: the app's link, which keeps the
 * path and the query string, drawn with the store's tokens instead of the
 * app's. A 44 px target; focus is the storefront's 3 px outline, on the
 * capsule.
 */
function StoreLocaleToggle({
  className,
  tone = "page",
}: StoreLocaleToggleProps) {
  const look = TONES[tone];

  return (
    <LocaleToggle
      className={cn("min-h-11 px-1", className)}
      classNames={{
        code: cn("text-xs font-semibold", look.code),
        thumb: look.thumb,
        track: cn(
          "transition-colors group-focus-visible:outline-3 group-focus-visible:outline-offset-2",
          look.track
        ),
      }}
      tone="bare"
    />
  );
}

export { StoreLocaleToggle };
