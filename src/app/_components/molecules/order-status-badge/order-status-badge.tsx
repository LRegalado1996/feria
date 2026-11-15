"use client";

import {
  CircleCheck,
  CircleX,
  Inbox,
  type LucideIcon,
  Package,
} from "lucide-react";

import { useDictionary } from "@/lib/hooks/i18n";
import type { OrderStatus } from "@/lib/schemas/order";
import { cn } from "@/lib/utils";

// Status chips (design.md § Color and surfaces). Text on its fill, light /
// dark: amber 6.4:1 / 10.4:1, blue 7.2:1 / 8.1:1, emerald 6.7:1 / 10:1,
// red 6.9:1 / 8.4:1.
const STATUS_STYLES = {
  delivered: {
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    icon: CircleCheck,
  },
  packed: {
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    icon: Package,
  },
  received: {
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    icon: Inbox,
  },
  undeliverable: {
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    icon: CircleX,
  },
} satisfies Record<OrderStatus, { className: string; icon: LucideIcon }>;

export interface OrderStatusBadgeProps {
  className?: string;
  status: OrderStatus;
}

/**
 * An order's status as an icon and its name, never a color alone
 * (FER-027): the icon is decoration, the text is what is read.
 */
function OrderStatusBadge({ className, status }: OrderStatusBadgeProps) {
  const { admin } = useDictionary();
  const { className: tone, icon: Icon } = STATUS_STYLES[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone,
        className
      )}
      data-slot="order-status-badge"
      data-status={status}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {admin.orders.statuses[status]}
    </span>
  );
}

export { OrderStatusBadge };
