"use client";

import { Skeleton } from "@/app/_components/atoms/skeleton";
import { useDictionary } from "@/lib/hooks/i18n";

/**
 * The admin shell's geometry while a page checks the session: the header
 * bar, the navigation column and a title, with nothing a signed-out visitor
 * should not see. A client component only to read the language the root
 * layout provides: the fallback renders before the page knows its params.
 */
function AdminShellSkeleton() {
  const { common } = useDictionary();

  return (
    <div
      aria-busy="true"
      className="min-h-dvh"
      data-slot="admin-shell-skeleton"
      data-testid="admin-shell-skeleton"
    >
      <output className="sr-only">{common.loading}</output>
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <Skeleton className="size-8" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8 md:py-8">
        <Skeleton className="h-9 w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
      </div>
    </div>
  );
}

export { AdminShellSkeleton };
