import { ChevronRight, House } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** A step of the trail: a page on the way, linked, or the page itself. */
export interface StoreBreadcrumbItem {
  /** Its address; the last step, the page itself, has none. */
  href?: string;
  /** The language its name is in, when it may differ from the page's. */
  lang?: string;
  name: string;
}

export interface StoreBreadcrumbProps {
  className?: string;
  /** The trail's own name for a screen reader ("Ruta"). */
  label: string;
  /**
   * From the home to the page, in order: Home › Bijouterie › Anillos. The
   * first is the home, drawn as a house.
   */
  items: readonly StoreBreadcrumbItem[];
}

const LINK_CLASS =
  "inline-flex min-h-11 items-center wrap-anywhere text-store-muted underline-offset-4 hover:text-store-foreground hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground";

/**
 * The visible trail from the home to a catalog page (FER-043), under its
 * cover (FER-044): a `nav` of an ordered list, each step a link but the
 * last, which is the page itself (`aria-current="page"`). The home is a
 * house (lucide's `House`), a 44 px target named by its word for a screen
 * reader ("Home"); the arrows between the steps are drawn, not read.
 * Rendered by the server, so it is in the HTML a crawler reads.
 */
function StoreBreadcrumb({ className, items, label }: StoreBreadcrumbProps) {
  return (
    <nav
      aria-label={label}
      className={cn("text-store-foreground", className)}
      data-slot="store-breadcrumb"
      data-testid="store-breadcrumb"
    >
      <ol className="flex flex-wrap items-center gap-x-1 text-sm">
        {items.map((item, index) => (
          // A step's address is its own; a group and its category, or the
          // home and a category, may share a name. The page itself has none.
          <li
            className="flex min-w-0 items-center gap-x-1"
            key={item.href ?? "current"}
          >
            {index > 0 ? (
              <ChevronRight
                aria-hidden="true"
                className="size-3.5 shrink-0 text-store-muted"
              />
            ) : null}
            <Step home={index === 0} item={item} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** One step: the page itself, the home's house, or a page on the way. */
function Step({ home, item }: { home: boolean; item: StoreBreadcrumbItem }) {
  if (item.href === undefined) {
    return (
      <span
        aria-current="page"
        className="font-semibold wrap-anywhere"
        lang={item.lang}
      >
        {item.name}
      </span>
    );
  }

  if (home) {
    // A 44 px square whose house sits on the page's margin.
    return (
      <Link
        className={cn(LINK_CLASS, "-ml-3.5 min-w-11 justify-center")}
        data-testid="store-breadcrumb-home"
        href={item.href}
      >
        <House
          aria-hidden="true"
          className="size-4 shrink-0"
          data-testid="store-breadcrumb-home-icon"
        />
        <span className="sr-only" lang={item.lang}>
          {item.name}
        </span>
      </Link>
    );
  }

  return (
    <Link className={LINK_CLASS} href={item.href} lang={item.lang}>
      {item.name}
    </Link>
  );
}

export { StoreBreadcrumb };
