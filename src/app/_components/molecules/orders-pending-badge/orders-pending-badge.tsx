"use client";

import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useOrderCounts } from "@/lib/hooks/order";
import { interpolate } from "@/lib/i18n/interpolate";
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
 *
 * The root and the spoken text are plain inline boxes, so the text joins the
 * label with no space before its comma: a browser naming the link puts one
 * around any other box, the usual `sr-only` (positioned) included, hence
 * `sr-only-inline`.
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
      className={className}
      data-slot="orders-pending-badge"
      data-testid="orders-pending-badge"
    >
      <span className="sr-only-inline">
        {received === 1
          ? admin.orders.pendingBadgeOne
          : interpolate(admin.orders.pendingBadge, {
              count: formatInteger(received, locale),
            })}
      </span>
      <span
        aria-hidden="true"
        className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums"
      >
        {formatInteger(received, locale)}
      </span>
    </span>
  );
}

export { OrdersPendingBadge };
