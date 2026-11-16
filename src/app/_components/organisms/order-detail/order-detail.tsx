"use client";

import { ArrowLeft, MessageCircle } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { AdminPage } from "@/app/_components/molecules/admin-page";
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
import { cn } from "@/lib/utils";
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
}

/** How the last move ended, when it did not go through. */
type MoveOutcome = "conflict" | "failed" | null;

/** One part of the order: a white card headed by what it holds. */
function DetailCard({
  children,
  className,
  testId,
  title,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
  title: string;
}) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border bg-card p-4 text-card-foreground md:p-5",
        className
      )}
      data-testid={testId}
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

/**
 * One order for the store's staff (FER-027, FER-040): its code in the top
 * bar with the moves its status allows (in the bar under the thumb on a
 * phone), then cards for its status, what was ordered, the customer's note,
 * how to reach them, and who moved it when.
 */
function OrderDetail({ from, id, renderedAt }: OrderDetailProps) {
  const { admin, common, storefront } = useDictionary();
  const copy = admin.orders;
  const locale = useLocale();
  const order = useOrder(id);
  const change = useChangeOrderStatus();
  const now = useNow(renderedAt);
  const [outcome, setOutcome] = useState<MoveOutcome>(null);

  // Opened: the list no longer marks it "New".
  useEffect(() => {
    markOrderSeen(id);
  }, [id]);

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
      href={ordersPath(locale, from)}
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {copy.detail.back}
    </Link>
  );

  // Until the order is read its code is unknown: the section names the page.
  if (order.isPending) {
    return (
      <section data-slot="order-detail">
        <AdminPage title={admin.storeSections.orders}>
          {back}
          <div
            aria-busy="true"
            className="space-y-4"
            data-testid="order-detail-skeleton"
          >
            <span className="sr-only">{common.loading}</span>
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        </AdminPage>
      </section>
    );
  }

  if (order.isError) {
    return (
      <section data-slot="order-detail">
        <AdminPage title={admin.storeSections.orders}>
          {back}
          <div
            className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
            role="alert"
          >
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
        </AdminPage>
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
      { id: found.id, status: to },
      {
        onError: (error) => {
          // The hook reports what needs reporting and reads the order again.
          setOutcome(isStatusConflict(error) ? "conflict" : "failed");
        },
      }
    );
  };

  return (
    <section data-slot="order-detail" data-testid="order-detail">
      <AdminPage
        primaryAction={
          // What a move said stays beside the moves: on a phone that is the
          // bar under the thumb, wherever the page is scrolled.
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            {outcome === "conflict" ? (
              <output className="block text-sm">{copy.errors.conflict}</output>
            ) : null}
            {outcome === "failed" ? (
              <p className="text-sm text-destructive" role="alert">
                {copy.errors.change}
              </p>
            ) : null}
            <OrderStatusActions
              code={found.code}
              onMove={onMove}
              pendingMove={change.isPending ? change.variables.status : null}
              status={found.status}
            />
          </div>
        }
        title={interpolate(copy.detail.title, { code: found.code })}
      >
        {back}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
          <div className="min-w-0 space-y-4 lg:space-y-6">
            <DetailCard title={copy.detail.status}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <OrderStatusBadge status={found.status} />
                <p className="text-sm text-muted-foreground">
                  <time dateTime={placed.dateTime}>{placed.text}</time>
                </p>
              </div>
            </DetailCard>
            <DetailCard title={copy.detail.items}>
              <ul className="divide-y" data-testid="order-items">
                {found.items.map((item) => (
                  <li
                    className="flex items-baseline gap-3 py-2 text-sm"
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
                className="flex items-baseline justify-between gap-3 border-t pt-3 text-sm"
                data-testid="order-total"
              >
                <span className="font-semibold">{copy.detail.total}</span>
                <span className="font-semibold tabular-nums">
                  {formatPrice(found.totalAmount, found.currencyCode, locale)}
                </span>
              </p>
            </DetailCard>
            {found.note ? (
              <DetailCard title={copy.detail.note}>
                <p className="text-base break-words whitespace-pre-line">
                  {found.note}
                </p>
              </DetailCard>
            ) : null}
          </div>
          <div className="min-w-0 space-y-4 lg:space-y-6">
            <DetailCard testId="order-contact" title={copy.detail.contact}>
              <div className="space-y-1 text-sm">
                <p className="font-semibold break-words">
                  {found.customerName}
                </p>
                <p>
                  <a
                    className="inline-flex min-h-11 items-center tabular-nums underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-9"
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
              <Button asChild className="w-full md:w-auto" variant="outline">
                <a
                  href={whatsappHref}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <MessageCircle aria-hidden="true" />
                  {copy.detail.whatsapp}
                  <span className="sr-only"> {storefront.shell.newTab}</span>
                </a>
              </Button>
            </DetailCard>
            <DetailCard title={copy.detail.history}>
              <ol className="space-y-3" data-testid="order-history">
                {found.history.map((event, index) => {
                  const at = new Date(event.createdAt);
                  // No login behind a move: the shopper placing the order,
                  // or a login since removed from the team.
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
            </DetailCard>
          </div>
        </div>
      </AdminPage>
    </section>
  );
}

export { OrderDetail };
