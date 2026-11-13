import { Inbox, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  className?: string;
  icon?: LucideIcon;
  message: string;
}

/**
 * A query that succeeded with nothing to show. Never the answer to a failed
 * or unfinished query: those have their own states (design.md § Data).
 */
function EmptyState({
  className,
  icon: Icon = Inbox,
  message,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-center",
        className
      )}
      data-slot="empty-state"
      data-testid="empty-state"
    >
      <Icon aria-hidden="true" className="size-12 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export { EmptyState };
