"use client";

import { ArrowLeft, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { OrderPhoneVerified } from "@/app/_components/molecules/order-phone-verified";
import { OrderStatusActions } from "@/app/_components/molecules/order-status-actions";
import { OrderStatusBadge } from "@/app/_components/molecules/order-status-badge";
import { markOrderSeen } from "@/lib/admin/order-arrivals";
import { type OrdersQuery, ordersPath } from "@/lib/admin/orders";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import {
  isStatusConflict,
  useChangeOrderStatus,
  useOrder,
} from "@/lib/hooks/order";
import { useNow } from "@/lib/hooks/ui";
import { interpolate } from "@/lib/i18n/interpolate";
import type { OrderStatus } from "@/lib/schemas/order";
import {
  formatDate,
  formatInteger,
  formatPrice,
  formatRelativeTime,
} from "@/lib/utils/format";

export interface OrderDetailProps {
  /** The list's tab and search it was opened from: where "Back" returns. */
  from: OrdersQuery;
  id: number;
  /** When the server rendered the page, the clock its times start from. */
  renderedAt: number;
  storeSlug: string;
}

/** How the last move ended, when it did not go through. */
type MoveOutcome = "conflict" | "failed" | null;

/**
 * One order for the store's staff (FER-027): its status and the moves it
 * allows, what was ordered, the customer's note, how to reach them, and who
 * moved it when.
 */
function OrderDetail({ from, id, renderedAt, storeSlug }: OrderDetailProps) {
  const { admin, common, storefront } = useDictionary();
  const copy = admin.orders;
  const locale = useLocale();
  const order = useOrder(storeSlug, id);
  const change = useChangeOrderStatus(storeSlug);
  const now = useNow(renderedAt);
  const [outcome, setOutcome] = useState<MoveOutcome>(null);

  // Opened: the list no longer marks it "New".
  useEffect(() => {
    markOrderSeen(storeSlug, id);
  }, [id, storeSlug]);

  const when = (date: Date | string) => {
    const instant = new Date(date);

    return {
      dateTime: instant.toISOString(),
      text: interpolate(copy.detail.placed, {
        date: formatDate(instant, locale),
        time: formatRelativeTime(instant, now, locale),
      }),
    };
  };

  const back = (
    <Link
      className="inline-flex h-11 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:h-9"
      href={ordersPath(storeSlug, locale, from)}
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {copy.detail.back}
    </Link>
  );

  if (order.isPending) {
    return (
      <section className="space-y-6" data-slot="order-detail">
        {back}
        <div
          aria-busy="true"
          className="space-y-3"
          data-testid="order-detail-skeleton"
        >
          <span className="sr-only">{common.loading}</span>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </section>
    );
  }

  if (order.isError) {
    return (
      <section className="space-y-6" data-slot="order-detail">
        {back}
        <div className="space-y-2" role="alert">
          <p className="text-sm">{copy.errors.order}</p>
          <Button
            onClick={() => {
              void order.refetch();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {common.tryAgain}
          </Button>
        </div>
      </section>
    );
  }

  const found = order.data;
  const placed = when(found.createdAt);
  const whatsappText = interpolate(copy.detail.whatsappText[found.locale], {
    code: found.code,
    name: found.customerName,
  });
  const whatsappHref = `https://wa.me/${found.customerPhone.replaceAll(/\D/gu, "")}?text=${encodeURIComponent(whatsappText)}`;

  const onMove = (to: OrderStatus) => {
    setOutcome(null);
    change.mutate(
      { id: found.id, status: to, storeSlug },
      {
        onError: (error) => {
          // The hook reports what needs reporting and reads the order again.
          setOutcome(isStatusConflict(error) ? "conflict" : "failed");
        },
      }
    );
  };

  return (
    <section
      className="space-y-8"
      data-slot="order-detail"
      data-testid="order-detail"
    >
      <div className="space-y-3">
        {back}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">
            {interpolate(copy.detail.title, { code: found.code })}
          </h1>
          <OrderStatusBadge status={found.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          <time dateTime={placed.dateTime}>{placed.text}</time>
        </p>
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{copy.detail.status}</h2>
        <OrderStatusActions
          code={found.code}
          onMove={onMove}
          pendingMove={change.isPending ? change.variables.status : null}
          status={found.status}
        />
        {outcome === "conflict" ? (
          <output className="block text-sm">{copy.errors.conflict}</output>
        ) : null}
        {outcome === "failed" ? (
          <p className="text-sm text-destructive" role="alert">
            {copy.errors.change}
          </p>
        ) : null}
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{copy.detail.items}</h2>
        <ul className="divide-y rounded-lg border" data-testid="order-items">
          {found.items.map((item) => (
            <li
              className="flex items-baseline gap-3 p-3 text-sm"
              key={item.productId}
            >
              <span className="min-w-0 flex-1">
                {interpolate(copy.detail.itemLine, {
                  quantity: formatInteger(item.quantity, locale),
                  title: item.title,
                })}
              </span>
              <span className="tabular-nums">
                {formatPrice(
                  item.unitPriceAmount * item.quantity,
                  found.currencyCode,
                  locale
                )}
              </span>
            </li>
          ))}
        </ul>
        <p
          className="flex items-baseline justify-between gap-3 px-3 text-sm"
          data-testid="order-total"
        >
          <span className="font-semibold">{copy.detail.total}</span>
          <span className="font-semibold tabular-nums">
            {formatPrice(found.totalAmount, found.currencyCode, locale)}
          </span>
        </p>
      </div>
      {found.note ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">{copy.detail.note}</h2>
          <p className="text-base break-words whitespace-pre-line">
            {found.note}
          </p>
        </div>
      ) : null}
      <div className="space-y-3" data-testid="order-contact">
        <h2 className="text-sm font-semibold">{copy.detail.contact}</h2>
        <div className="space-y-1 text-sm">
          <p className="font-semibold break-words">{found.customerName}</p>
          <p>
            <a
              className="inline-flex min-h-11 items-center tabular-nums underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              href={`tel:${found.customerPhone}`}
            >
              <span className="sr-only">{copy.detail.phone} </span>
              {found.customerPhone}
            </a>
          </p>
          <p className="text-xs text-muted-foreground">
            <OrderPhoneVerified verified={found.phoneVerified} />
          </p>
        </div>
        <Button asChild className="h-11 md:h-9" variant="outline">
          <a href={whatsappHref} rel="noopener noreferrer" target="_blank">
            <MessageCircle aria-hidden="true" />
            {copy.detail.whatsapp}
            <span className="sr-only"> {storefront.shell.newTab}</span>
          </a>
        </Button>
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{copy.detail.history}</h2>
        <ol className="space-y-3" data-testid="order-history">
          {found.history.map((event, index) => {
            const at = new Date(event.createdAt);
            // No login behind a move: the shopper placing the order, or a
            // login since removed from the team.
            const placing = index === 0 && event.status === "received";
            const withoutLogin = placing
              ? copy.detail.historyPlaced
              : copy.detail.historyFormer;

            return (
              <li
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                key={`${at.toISOString()}:${event.status}`}
              >
                <OrderStatusBadge status={event.status} />
                <span>{event.changedByName ?? withoutLogin}</span>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={at.toISOString()}
                >
                  {formatRelativeTime(at, now, locale)}
                </time>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export { OrderDetail };
