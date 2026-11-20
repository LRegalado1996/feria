import type { ReactNode } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
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
 * A page that could not show what was asked (FER-021), under the store's
 * header: what happened, in the display face, and the way out.
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
        "flex w-full flex-col items-start gap-6 px-4 py-16 text-store-foreground md:px-7 md:py-28",
        className
      )}
      data-slot="store-status-page"
      data-testid="store-status-page"
    >
      <h1 className="max-w-4xl font-display store-display-page leading-display font-extrabold wrap-anywhere uppercase">
        {title}
      </h1>
      {/* A failure is announced as it replaces the page; a miss is not. */}
      <p className="max-w-prose text-base" role={retry ? "alert" : undefined}>
        {body}
      </p>
      {action}
      {retry ? (
        <StoreButton
          onClick={() => {
            retry.onRetry();
          }}
          size="lg"
          type="button"
        >
          {retry.label}
        </StoreButton>
      ) : null}
    </main>
  );
}

export { StoreStatusPage };
