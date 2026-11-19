import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StoreAnnouncementBarProps = Omit<ComponentProps<"div">, "lang"> & {
  /**
   * Where its words lead (FER-020): a path of this site, already in the
   * page's language, or a full `https` address. Without it the bar is only
   * words.
   */
  href?: string | null;
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
  short?: string | null;
};

/**
 * The notice, and its phone version when there is one: the whole notice is
 * always in the HTML, and with a phone version it is hidden to the eye
 * below `lg`; the short one is for the eye only.
 */
function Words({
  children,
  short,
}: {
  children: ReactNode;
  short?: string | null;
}) {
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

const LINK_CLASS =
  "underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground";

/**
 * The words as a link when the announcement has one: a path of the site
 * through Next's `Link`, an address elsewhere as a plain link. Its name is
 * the whole notice, the same at every width.
 */
function Linked({ children, href }: { children: ReactNode; href: string }) {
  return href.startsWith("/") ? (
    <Link
      className={LINK_CLASS}
      data-testid="store-announcement-bar-link"
      href={href}
    >
      {children}
    </Link>
  ) : (
    <a
      className={LINK_CLASS}
      data-testid="store-announcement-bar-link"
      href={href}
      rel="noopener"
    >
      {children}
    </a>
  );
}

/**
 * The lime line above the header (FER-039): one short notice, the
 * foreground on the accent (14:1), in the display face. Its words are the
 * store's announcement (FER-020), with a shorter version for a phone and
 * an optional link.
 */
function StoreAnnouncementBar({
  children,
  className,
  href,
  lang,
  placeholder = false,
  short,
  ...props
}: StoreAnnouncementBarProps) {
  const words = <Words short={short}>{children}</Words>;
  const said = href ? <Linked href={href}>{words}</Linked> : words;

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
      <p lang={lang}>{placeholder ? "\u00A0" : said}</p>
    </div>
  );
}

export { StoreAnnouncementBar };
