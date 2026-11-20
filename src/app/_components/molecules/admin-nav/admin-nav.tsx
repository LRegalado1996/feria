import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface AdminNavItem {
  /**
   * Shown at the end of the row, inside the link (the orders still to
   * pack). It names the link: the label is hidden from assistive technology
   * while a badge is given, so the badge says the whole name, label included.
   */
  badge?: ReactNode;
  current: boolean;
  href: string;
  /** Drawn before the label, for the eye only. */
  icon: LucideIcon;
  label: string;
}

export interface AdminNavProps {
  className?: string;
  items: AdminNavItem[];
  /** The landmark's name. */
  label: string;
}

/**
 * The admin's sections, one row each: the icon, the label and, for the
 * orders, the badge at the end (FER-040). A 44 px row on a phone, where the
 * list opens in the menu panel; a compact one in the sidebar from `md` up.
 * The section on screen carries `aria-current="page"` and is drawn filled
 * and bold, never by its fill alone.
 */
function AdminNav({ className, items, label }: AdminNavProps) {
  return (
    <nav
      aria-label={label}
      className={cn("min-w-0", className)}
      data-slot="admin-nav"
    >
      <ul className="flex flex-col gap-0.5">
        {items.map(({ badge, current, href, icon: Icon, label: name }) => (
          <li key={href}>
            <Link
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-md px-3 text-base transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:h-9 md:text-sm",
                current
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
              href={href}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span
                aria-hidden={badge ? true : undefined}
                className="min-w-0 flex-1 truncate"
              >
                {name}
              </span>
              {badge}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export { AdminNav };
