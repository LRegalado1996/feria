"use client";

import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useOrderCounts } from "@/lib/hooks/order";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";
import { formatInteger } from "@/lib/utils/format";

export interface OrdersPendingBadgeProps {
  className?: string;
  storeSlug: string;
}

/**
 * How many of the store's orders are still to pack, inside the navigation's
 * orders link (FER-027); read again every 15 seconds. The figure is for the
 * eye; a screen reader hears it as part of the link's name ("Orders, 3 to
 * pack"). Nothing while there are none, or before the count is known.
 */
function OrdersPendingBadge({ className, storeSlug }: OrdersPendingBadgeProps) {
  const { admin } = useDictionary();
  const locale = useLocale();
  const counts = useOrderCounts(storeSlug);
  const received = counts.data?.received ?? 0;

  if (received === 0) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums",
        className
      )}
      data-slot="orders-pending-badge"
      data-testid="orders-pending-badge"
    >
      <span aria-hidden="true">{formatInteger(received, locale)}</span>
      <span className="sr-only">
        {received === 1
          ? admin.orders.pendingBadgeOne
          : interpolate(admin.orders.pendingBadge, {
              count: formatInteger(received, locale),
            })}
      </span>
    </span>
  );
}

export { OrdersPendingBadge };
