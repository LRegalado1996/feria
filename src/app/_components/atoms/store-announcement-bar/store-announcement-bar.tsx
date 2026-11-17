import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StoreAnnouncementBarProps = Omit<ComponentProps<"div">, "lang"> & {
  /** The language its words are in, when they may differ from the page's. */
  lang?: string;
  /**
   * Holds the bar's height, empty, while its words stream in, so the header
   * below does not jump when they arrive.
   */
  placeholder?: boolean;
  /**
   * The words for a phone, where the whole notice would not fit on one
   * line. Shown instead of it below `lg`, to the eye only: the whole notice
   * stays in the HTML for screen readers and crawlers, hidden visually
   * there, so every reader gets the same words.
   */
  short?: string;
};

/**
 * The notice, and its phone version when there is one: the whole notice is
 * always in the HTML, and with a phone version it is hidden to the eye
 * below `lg`; the short one is for the eye only.
 */
function Words({ children, short }: { children: ReactNode; short?: string }) {
  return (
    <>
      <span
        className={short ? "max-lg:sr-only" : undefined}
        data-slot="store-announcement-bar-full"
        data-testid="store-announcement-bar-full"
      >
        {children}
      </span>
      {short ? (
        <span
          aria-hidden="true"
          className="lg:hidden"
          data-slot="store-announcement-bar-short"
          data-testid="store-announcement-bar-short"
        >
          {short}
        </span>
      ) : null}
    </>
  );
}

/**
 * The lime line above the header (FER-039): one short notice, the
 * foreground on the accent (14:1), in the display face. Until the store has
 * announcements of its own (FER-020) it carries a fixed one from the
 * dictionaries, with a shorter version for a phone.
 */
function StoreAnnouncementBar({
  children,
  className,
  lang,
  placeholder = false,
  short,
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
      <p lang={lang}>
        {placeholder ? " " : <Words short={short}>{children}</Words>}
      </p>
    </div>
  );
}

export { StoreAnnouncementBar };
