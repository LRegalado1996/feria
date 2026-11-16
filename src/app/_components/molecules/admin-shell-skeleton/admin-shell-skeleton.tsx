"use client";

import { Skeleton } from "@/app/_components/atoms/skeleton";
import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { useDictionary } from "@/lib/hooks/i18n";

/** As many rows as the navigation has sections. */
const NAV_ROWS = [
  "orders",
  "products",
  "categories",
  "filters",
  "home",
  "settings",
  "users",
  "metrics",
] as const;

/**
 * The admin shell's geometry while a page checks the session (FER-040): the
 * sidebar with the logo and the sections' rows from `md` up, the top bar
 * with the menu button's place on a phone, and a card on the grey canvas,
 * with nothing a signed-out visitor should not see. A client component only
 * to read the language the root layout provides: the fallback renders
 * before the page knows its params.
 */
function AdminShellSkeleton() {
  const { common } = useDictionary();

  return (
    <div
      aria-busy="true"
      className="min-h-dvh bg-sidebar md:grid md:grid-cols-[16rem_minmax(0,1fr)]"
      data-slot="admin-shell-skeleton"
      data-testid="admin-shell-skeleton"
    >
      <output className="sr-only">{common.loading}</output>
      <div className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border md:flex">
        <div className="p-6">
          {/* The brand is no secret: the sign-in page shows it too. */}
          <StoreLogo aria-hidden="true" className="h-24" variant="full" />
        </div>
        <div className="space-y-0.5 p-3">
          {NAV_ROWS.map((row) => (
            <Skeleton className="h-9 w-full" key={row} />
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <div className="border-b border-sidebar-border">
          <div className="mx-auto flex min-h-14 w-full max-w-6xl items-center gap-2 px-2 md:min-h-16 md:px-8">
            <Skeleton className="size-11 md:hidden" />
            <Skeleton className="h-6 w-40" />
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-4 md:px-8 md:pt-8">
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export { AdminShellSkeleton };
