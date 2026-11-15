import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface StoreStatusPageProps {
  /** The way out when it is a link (home, the catalog). */
  action?: ReactNode;
  body: string;
  className?: string;
  /** The way out when it is trying again. */
  retry?: { label: string; onRetry: () => void };
  title: string;
}

/**
 * A page that could not show what was asked (FER-021), inside the store's
 * header and footer: what happened, in the store's type, and the way out.
 */
function StoreStatusPage({
  action,
  body,
  className,
  retry,
  title,
}: StoreStatusPageProps) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 py-16 md:py-24",
        className
      )}
      data-slot="store-status-page"
      data-testid="store-status-page"
    >
      <h1 className="font-display text-5xl leading-display tracking-display text-store-foreground uppercase md:text-7xl">
        {title}
      </h1>
      {/* A failure is announced as it replaces the page; a miss is not. */}
      <p
        className="max-w-prose text-base text-store-foreground"
        role={retry ? "alert" : undefined}
      >
        {body}
      </p>
      {action}
      {retry ? (
        <button
          className="inline-flex min-h-11 items-center bg-store-contrast px-6 font-semibold text-store-background hover:bg-store-accent hover:text-store-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
          onClick={() => {
            retry.onRetry();
          }}
          type="button"
        >
          {retry.label}
        </button>
      ) : null}
    </main>
  );
}

export { StoreStatusPage };
