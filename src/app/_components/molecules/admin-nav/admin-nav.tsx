import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface AdminNavItem {
  /**
   * Shown after the label, inside the link (the orders still to pack). It
   * names the link: the label is hidden from assistive technology while a
   * badge is given, so the badge says the whole name, label included.
   */
  badge?: ReactNode;
  current: boolean;
  href: string;
  label: string;
}

export interface AdminNavProps {
  className?: string;
  items: AdminNavItem[];
  /** The landmark's name: two navigations can share a page. */
  label: string;
  /** A heading above the links, on wide screens. */
  title?: string;
}

/**
 * A list of admin sections. On a phone it is a row that scrolls sideways in
 * its own box (the page never does); from `md` up a column beside the
 * content. The section on screen carries `aria-current="page"`.
 */
function AdminNav({ className, items, label, title }: AdminNavProps) {
  return (
    <nav
      aria-label={label}
      className={cn("min-w-0", className)}
      data-slot="admin-nav"
    >
      {title ? (
        <p className="hidden px-3 pb-1 text-xs text-muted-foreground md:block">
          {title}
        </p>
      ) : null}
      <ul className="flex gap-1 overflow-x-auto overflow-y-clip pb-1 md:flex-col md:overflow-visible md:pb-0">
        {items.map((item) => (
          <li className="shrink-0" key={item.href}>
            <Link
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:h-9",
                item.current
                  ? "bg-secondary font-semibold text-secondary-foreground"
                  : "text-muted-foreground"
              )}
              href={item.href}
            >
              <span>
                {item.badge ? (
                  <>
                    <span aria-hidden="true">{item.label}</span>
                    {item.badge}
                  </>
                ) : (
                  item.label
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export { AdminNav };
