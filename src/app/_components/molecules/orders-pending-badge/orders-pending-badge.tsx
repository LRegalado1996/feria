"use client";

import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useOrderCounts } from "@/lib/hooks/order";
import { interpolate } from "@/lib/i18n/interpolate";
import { formatInteger } from "@/lib/utils/format";

export interface OrdersPendingBadgeProps {
  className?: string;
  /** The link's label ("Pedidos"), which the navigation hides: this says it. */
  label: string;
}

/**
 * How many of the store's orders are still to pack, inside the navigation's
 * orders link (FER-027); read again every 15 seconds. The figure is for the
 * eye; a screen reader hears the link's whole name from one `sr-only` span
 * ("Orders, 3 to pack"), or the label alone while there are none or the
 * count is not known yet. One span, because Chromium puts a space before a
 * positioned box when it joins it to the text in front.
 */
function OrdersPendingBadge({ className, label }: OrdersPendingBadgeProps) {
  const { admin } = useDictionary();
  const locale = useLocale();
  const counts = useOrderCounts();
  const received = counts.data?.received ?? 0;
  const figure = formatInteger(received, locale);
  let name = label;
  if (received === 1) {
    name = interpolate(admin.orders.pendingBadgeOne, { label });
  } else if (received > 1) {
    name = interpolate(admin.orders.pendingBadge, { count: figure, label });
  }

  return (
    <span className={className} data-slot="orders-pending-badge">
      <span className="sr-only">{name}</span>
      {received > 0 ? (
        <span
          aria-hidden="true"
          className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums"
          data-testid="orders-pending-badge"
        >
          {figure}
        </span>
      ) : null}
    </span>
  );
}

export { OrdersPendingBadge };
