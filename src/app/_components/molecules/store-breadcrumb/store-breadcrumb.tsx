import { ChevronRight } from "lucide-react";
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
  /** From the home to the page, in order: Inicio › Bijouterie › Anillos. */
  items: readonly StoreBreadcrumbItem[];
}

/**
 * The visible trail from the home to a catalog page (FER-043): a `nav` of
 * an ordered list, each step a link but the last, which is the page itself
 * (`aria-current="page"`). The arrows between them are drawn, not read.
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
            {item.href === undefined ? (
              <span
                aria-current="page"
                className="font-semibold wrap-anywhere"
                lang={item.lang}
              >
                {item.name}
              </span>
            ) : (
              <Link
                className="inline-flex min-h-11 items-center wrap-anywhere text-store-muted underline-offset-4 hover:text-store-foreground hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
                href={item.href}
                lang={item.lang}
              >
                {item.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export { StoreBreadcrumb };
