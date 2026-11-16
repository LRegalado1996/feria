import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type StoreAnnouncementBarProps = Omit<ComponentProps<"div">, "lang"> & {
  /** The language its words are in, when they may differ from the page's. */
  lang?: string;
  /**
   * Holds the bar's height, empty, while its words stream in, so the header
   * below does not jump when they arrive.
   */
  placeholder?: boolean;
};

/**
 * The lime line above the header (FER-039): one short notice, the
 * foreground on the accent (14:1), in the display face. Until the store has
 * announcements of its own (FER-020) it carries its tagline.
 */
function StoreAnnouncementBar({
  children,
  className,
  lang,
  placeholder = false,
  ...props
}: StoreAnnouncementBarProps) {
  return (
    <div
      aria-hidden={placeholder ? true : undefined}
      className={cn(
        "bg-store-accent px-4 py-2.5 text-center font-display text-xs leading-tight font-extrabold wrap-anywhere text-store-foreground uppercase",
        className
      )}
      data-placeholder={placeholder}
      data-slot="store-announcement-bar"
      data-testid="store-announcement-bar"
      {...props}
    >
      {/* A no-break space gives the empty bar one line's height. */}
      <p lang={lang}>{placeholder ? " " : children}</p>
    </div>
  );
}

export { StoreAnnouncementBar };
