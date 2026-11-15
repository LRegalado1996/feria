"use client";

import { Sparkles, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { EmptyState } from "@/app/_components/molecules/empty-state";
import { OrderPhoneVerified } from "@/app/_components/molecules/order-phone-verified";
import { OrderSearch } from "@/app/_components/molecules/order-search";
import { OrderStatusBadge } from "@/app/_components/molecules/order-status-badge";
import { type OrdersQuery, orderPath, ordersPath } from "@/lib/admin/orders";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import {
  type OrdersPage,
  useOrderCounts,
  useOrderSound,
  useOrders,
} from "@/lib/hooks/order";
import { useNow } from "@/lib/hooks/ui";
import { interpolate } from "@/lib/i18n/interpolate";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/schemas/order";
import { cn } from "@/lib/utils";
import {
  formatInteger,
  formatPrice,
  formatRelativeTime,
} from "@/lib/utils/format";

type OrderRow = OrdersPage["items"][number];

export interface OrderManagerProps {
  /** The status and search in the address, already read and checked. */
  query: OrdersQuery;
  /** When the server rendered the screen: its clock, and when it opened. */
  renderedAt: number;
  storeSlug: string;
}

/** What the screen announced of the orders placed since it opened. */
interface Arrivals {
  /** The orders already said, never said again. */
  announced: ReadonlySet<number>;
  /** How many announcements, one per list that brought arrivals. */
  count: number;
  message: string;
  /** The first render's instant, kept as the screen moves between tabs. */
  openedAt: number;
}

/** An order placed after the screen opened. */
function arrivedSince(order: OrderRow, openedAt: number) {
  return new Date(order.createdAt).getTime() > openedAt;
}

/**
 * The orders in `items` placed after the screen opened (`renderedAt`, kept
 * from the first render as the screen moves between tabs): each is said
 * once in `message`, and `play` runs once per list that brought any.
 */
function useArrivals(
  items: OrderRow[] | undefined,
  renderedAt: number,
  play: () => void
) {
  const { admin } = useDictionary();
  const copy = admin.orders;
  const locale = useLocale();
  const [arrivals, setArrivals] = useState<Arrivals>(() => ({
    announced: new Set(),
    count: 0,
    message: "",
    openedAt: renderedAt,
  }));
  // How many arrivals have beeped, so a render never beeps twice for one.
  const beeped = useRef(0);
  const fresh = (items ?? []).filter(
    (order) =>
      arrivedSince(order, arrivals.openedAt) &&
      !arrivals.announced.has(order.id)
  );

  // Orders the list just brought that were placed since the screen opened:
  // said once, as the list renders them.
  if (fresh.length > 0) {
    setArrivals({
      announced: new Set([
        ...arrivals.announced,
        ...fresh.map((order) => order.id),
      ]),
      count: arrivals.count + 1,
      message:
        fresh.length === 1
          ? interpolate(copy.arrived, { code: fresh[0]?.code ?? "" })
          : interpolate(copy.arrivedMany, {
              codes: fresh.map((order) => order.code).join(", "),
              count: formatInteger(fresh.length, locale),
            }),
      openedAt: arrivals.openedAt,
    });
  }

  // The beep is the one side effect of an arrival: it waits for the commit.
  useEffect(() => {
    if (arrivals.count > beeped.current) {
      beeped.current = arrivals.count;
      play();
    }
  }, [arrivals.count, play]);

  return arrivals;
}

/**
 * A store's orders (FER-027), newest first, refreshed every 15 seconds while
 * open: this screen is the only place a new order is announced. An order
 * placed after it opened is marked "New" and said in a polite live region,
 * with a beep if the staff turned the sound on. The status tab and the search
 * live in the address. Each row is a link: a tap opens the order.
 */
function OrderManager({ query, renderedAt, storeSlug }: OrderManagerProps) {
  const { admin, common } = useDictionary();
  const copy = admin.orders;
  const orders = useOrders(storeSlug, query);
  const now = useNow(renderedAt);
  const sound = useOrderSound();
  const list = useRef<HTMLUListElement>(null);
  // Where focus goes once "Load more" brings its page: the first new row.
  const focusRow = useRef<number | null>(null);
  const items = orders.data?.pages.flatMap((page) => page.items);
  const arrivals = useArrivals(items, renderedAt, sound.play);

  const rowCount = items?.length ?? 0;

  useEffect(() => {
    if (focusRow.current !== null && rowCount > focusRow.current) {
      list.current?.querySelectorAll("a")[focusRow.current]?.focus();
      focusRow.current = null;
    }
  }, [rowCount]);

  let emptyMessage = copy.empty[query.status ?? "all"];

  if (query.q) {
    emptyMessage = interpolate(copy.empty.search, { q: query.q });
  }

  return (
    <section
      className="space-y-6"
      data-slot="order-manager"
      data-testid="order-manager"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <Button
          aria-pressed={sound.enabled === true}
          className="h-11 md:h-8"
          disabled={sound.enabled === null}
          onClick={() => {
            sound.setEnabled(sound.enabled !== true);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {sound.enabled === true ? (
            <Volume2 aria-hidden="true" />
          ) : (
            <VolumeX aria-hidden="true" />
          )}
          {copy.sound}
        </Button>
      </div>
      <OrderTabs query={query} storeSlug={storeSlug} />
      <OrderSearch query={query} storeSlug={storeSlug} />
      <output aria-live="polite" className="sr-only">
        {arrivals.message}
      </output>
      {orders.isPending ? (
        <div
          aria-busy="true"
          className="space-y-2"
          data-testid="order-list-skeleton"
        >
          <span className="sr-only">{common.loading}</span>
          {["first", "second", "third"].map((row) => (
            <Skeleton className="h-20 w-full" key={row} />
          ))}
        </div>
      ) : null}
      {orders.isError && !items ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm">{copy.errors.load}</p>
          <Button
            onClick={() => {
              void orders.refetch();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {common.tryAgain}
          </Button>
        </div>
      ) : null}
      {items?.length === 0 ? <EmptyState message={emptyMessage} /> : null}
      {items && items.length > 0 ? (
        <ul
          aria-label={copy.list}
          className="divide-y rounded-lg border"
          data-testid="order-list"
          ref={list}
        >
          {items.map((order) => (
            <OrderListRow
              isNew={arrivedSince(order, arrivals.openedAt)}
              key={order.id}
              now={now}
              order={order}
              storeSlug={storeSlug}
            />
          ))}
        </ul>
      ) : null}
      {orders.isFetchNextPageError ? (
        <p className="text-sm" role="alert">
          {copy.errors.loadMore}
        </p>
      ) : null}
      {orders.hasNextPage ? (
        <Button
          aria-disabled={orders.isFetchingNextPage || undefined}
          className="h-11 w-full aria-disabled:opacity-50 md:h-9 md:w-auto"
          onClick={() => {
            if (orders.isFetchingNextPage) {
              return;
            }

            focusRow.current = rowCount;
            // A failure lands in the query's state, which the list renders.
            void orders.fetchNextPage();
          }}
          type="button"
          variant="outline"
        >
          {orders.isFetchingNextPage ? copy.loadingMore : copy.loadMore}
        </Button>
      ) : null}
    </section>
  );
}

/** "All" and each status as links, each with its count once known. */
function OrderTabs({
  query,
  storeSlug,
}: {
  query: OrdersQuery;
  storeSlug: string;
}) {
  const copy = useDictionary().admin.orders;
  const locale = useLocale();
  const counts = useOrderCounts(storeSlug);

  const tabCount = (status: OrderStatus | undefined) => {
    if (!counts.data) {
      return undefined;
    }

    return status
      ? counts.data[status]
      : ORDER_STATUSES.reduce(
          (sum, each) => sum + (counts.data?.[each] ?? 0),
          0
        );
  };

  return (
    <nav aria-label={copy.tabs} className="min-w-0">
      <ul className="flex gap-1 overflow-x-auto overflow-y-clip pb-1">
        {[undefined, ...ORDER_STATUSES].map((status) => {
          const label = status ? copy.statuses[status] : copy.tabAll;
          const count = tabCount(status);
          const current = query.status === status;

          return (
            <li className="shrink-0" key={status ?? "all"}>
              <Link
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center rounded-md px-3 text-sm whitespace-nowrap transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:h-9",
                  current
                    ? "bg-secondary font-semibold text-secondary-foreground"
                    : "text-muted-foreground"
                )}
                href={ordersPath(storeSlug, locale, { q: query.q, status })}
              >
                {count === undefined
                  ? label
                  : interpolate(copy.tab, {
                      count: formatInteger(count, locale),
                      label,
                    })}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function OrderListRow({
  isNew,
  now,
  order,
  storeSlug,
}: {
  isNew: boolean;
  now: number;
  order: OrderRow;
  storeSlug: string;
}) {
  const copy = useDictionary().admin.orders;
  const locale = useLocale();
  const createdAt = new Date(order.createdAt);

  return (
    <li data-testid={`order-row-${order.code}`}>
      <Link
        className="flex flex-col gap-1 p-3 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href={orderPath(storeSlug, order.id, locale)}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{order.code}</span>
          {isNew ? (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground"
              data-testid="order-new"
            >
              <Sparkles aria-hidden="true" className="size-3.5" />
              {copy.new}
            </span>
          ) : null}
          <OrderStatusBadge className="ml-auto" status={order.status} />
        </span>
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm">
            {order.customerName}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {formatPrice(order.totalAmount, order.currencyCode, locale)}
          </span>
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <time dateTime={createdAt.toISOString()}>
            {formatRelativeTime(createdAt, now, locale)}
          </time>
          <OrderPhoneVerified verified={order.phoneVerified} />
        </span>
      </Link>
    </li>
  );
}

export { OrderManager };
