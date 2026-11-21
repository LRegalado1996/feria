import type { ReactNode, Ref } from "react";

import { AdminMenuButton } from "@/app/_components/molecules/admin-menu";
import { AdminPrimaryAction } from "@/app/_components/molecules/admin-primary-action";
import { cn } from "@/lib/utils";

export interface AdminPageProps {
  /**
   * Controls that stay in the top bar at every width, after the title (the
   * orders' sound switch).
   */
  actions?: ReactNode;
  children: ReactNode;
  /** A line under the top bar's row, about one of its controls. */
  notice?: ReactNode;
  /**
   * The screen's main action: at the end of the top bar from `md` up, and in
   * a bar along the bottom of a phone's screen, under the thumb, while the
   * page scrolls, and above the keyboard while typing (FER-053). One element
   * in both places, so it has one state and one name.
   */
  primaryAction?: ReactNode;
  /** The page's one heading. */
  title: ReactNode;
  /**
   * Makes the heading a focus target: where focus goes once the row that
   * held it is gone (a deleted category).
   */
  titleRef?: Ref<HTMLHeadingElement>;
}

/**
 * One admin screen (FER-040): a sticky top bar (the menu button on a phone,
 * the page's one heading, its controls) over the content, on the shell's
 * grey canvas. What the content puts in cards is its own.
 */
function AdminPage({
  actions,
  children,
  notice,
  primaryAction,
  title,
  titleRef,
}: AdminPageProps) {
  return (
    <div className="min-w-0" data-slot="admin-page">
      <div
        className="sticky top-0 z-20 border-b border-sidebar-border bg-sidebar"
        data-slot="admin-top-bar"
        data-testid="admin-top-bar"
      >
        {/* The title keeps 12rem: the actions take the next line before it
            is cut to nothing. */}
        <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-2 px-2 py-1.5 md:min-h-16 md:gap-3 md:px-8">
          <AdminMenuButton className="md:hidden" />
          <h1
            className={cn(
              "min-w-0 flex-[1_1_12rem] truncate text-lg font-semibold md:text-xl",
              // Focused only by the screen, never by a tab or a click.
              titleRef ? "focus-visible:outline-none" : undefined
            )}
            ref={titleRef}
            tabIndex={titleRef ? -1 : undefined}
          >
            {title}
          </h1>
          {actions}
          {primaryAction ? (
            <AdminPrimaryAction>{primaryAction}</AdminPrimaryAction>
          ) : null}
        </div>
        {notice ? (
          <div
            className="mx-auto w-full max-w-6xl px-4 pb-2 text-xs text-muted-foreground md:px-8 md:text-right"
            data-slot="admin-top-bar-notice"
          >
            {notice}
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          "mx-auto w-full max-w-6xl space-y-6 px-4 pt-4 md:px-8 md:pt-8",
          // On a phone the main action's bar covers the end of the page.
          primaryAction ? "pb-40 md:pb-12" : "pb-12"
        )}
        data-slot="admin-page-body"
      >
        {children}
      </div>
    </div>
  );
}

export { AdminPage };
