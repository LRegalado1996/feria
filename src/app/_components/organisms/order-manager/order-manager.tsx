"use client";

import { Sparkles, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { EmptyState } from "@/app/_components/molecules/empty-state";
import { OrderPhoneVerified } from "@/app/_components/molecules/order-phone-verified";
import { OrderSearch } from "@/app/_components/molecules/order-search";
import { OrderStatusBadge } from "@/app/_components/molecules/order-status-badge";
import {
  freshArrivals,
  isFreshArrival,
  lastArrival,
  NO_ARRIVALS,
  recordOrderList,
  subscribeArrivals,
} from "@/lib/admin/order-arrivals";
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
  /** When the server rendered the screen: the clock the ages start from. */
  renderedAt: number;
}

/**
 * The orders that arrived while this tab watched the store's lists: each is
 * said once in `message`, and `play` runs once per list that brought any. The
 * tab's record of what it has seen (`order-arrivals`) outlives the screen,
 * so leaving for an order and coming back neither repeats nor misses one.
 */
function useArrivals(
  { q, status }: OrdersQuery,
  orders: Pick<ReturnType<typeof useOrders>, "data" | "isPlaceholderData">,
  play: () => void
) {
  const { admin } = useDictionary();
  const copy = admin.orders;
  const locale = useLocale();
  const fresh = useSyncExternalStore(
    subscribeArrivals,
    freshArrivals,
    () => NO_ARRIVALS
  );
  const [message, setMessage] = useState("");
  const announce = useEffectEvent((codes: readonly string[]) => {
    setMessage(
      codes.length === 1
        ? interpolate(copy.arrived, { code: codes[0] ?? "" })
        : interpolate(copy.arrivedMany, {
            codes: codes.join(", "),
            count: formatInteger(codes.length, locale),
          })
    );
    play();
  });
  const { data, isPlaceholderData } = orders;

  // Arrivals recorded from here on are this screen's to say: declared before
  // the effect that records, so a list read as the screen mounts is heard.
  useEffect(() => {
    let said = lastArrival()?.seq ?? 0;

    return subscribeArrivals(() => {
      const last = lastArrival();

      if (last && last.seq > said) {
        said = last.seq;
        announce(last.codes);
      }
    });
  }, []);

  // A list shown while another status or search loads is not that list.
  useEffect(() => {
    if (!data || isPlaceholderData) {
      return;
    }

    recordOrderList(
      { q, status },
      data.pages.map((page) => page.items),
      Date.now()
    );
  }, [data, isPlaceholderData, q, status]);

  return { fresh, message };
}

/**
 * "Load more", and where focus goes once it brings its page: the first new
 * row of the list (status and search) it was asked for.
 */
function useLoadMore(
  orders: Pick<
    ReturnType<typeof useOrders>,
    "fetchNextPage" | "isFetchingNextPage"
  >,
  { q, status }: OrdersQuery,
  rowCount: number
) {
  const list = useRef<HTMLUListElement>(null);
  const focusRow = useRef<{ list: string; row: number } | null>(null);
  const listName = JSON.stringify([status ?? null, q ?? null]);

  useEffect(() => {
    const pending = focusRow.current;

    if (pending === null) {
      return;
    }

    // Another status or search is another list: the row a "Load more" on
    // the last one waited to focus is not in it, even when the new list,
    // already read, arrives longer in the same render.
    if (pending.list !== listName) {
      focusRow.current = null;
    } else if (rowCount > pending.row) {
      list.current?.querySelectorAll("a")[pending.row]?.focus();
      focusRow.current = null;
    }
  }, [listName, rowCount]);

  const loadMore = () => {
    if (orders.isFetchingNextPage) {
      return;
    }

    const asked = { list: listName, row: rowCount };
    focusRow.current = asked;
    // A failure lands in the query's state, which the list renders. A page
    // that failed, or came back empty (its orders left the list meanwhile),
    // brings no row to focus: the request is forgotten, so a later read
    // that grows the list (an arrival) leaves focus where it is.
    void (async () => {
      const result = await orders.fetchNextPage();
      const rows =
        result.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ??
        0;

      if ((result.isError || rows <= asked.row) && focusRow.current === asked) {
        focusRow.current = null;
      }
    })();
  };

  return { list, loadMore };
}

/**
 * The store's orders (FER-027), newest first, refreshed every 15 seconds while
 * open: this screen is the only place a new order is announced. An order
 * that arrives while it is open is marked "New" (until it is opened, leaves
 * received or ten minutes pass) and said in a polite live region, with a beep
 * if the staff turned the sound on. The status tab and the search live in
 * the address, and each row's link carries them to the order and back.
 */
function OrderManager({ query, renderedAt }: OrderManagerProps) {
  const { admin, common } = useDictionary();
  const copy = admin.orders;
  const orders = useOrders(query);
  const now = useNow(renderedAt);
  const sound = useOrderSound();
  const soundHint = useId();
  const items = orders.data?.pages.flatMap((page) => page.items);
  const arrivals = useArrivals(query, orders, sound.play);

  const rowCount = items?.length ?? 0;
  // An empty list kept on screen while another status or search loads is
  // the last one's: it is no answer for this one, so the skeleton waits.
  const waitsForList =
    orders.isPending || (orders.isPlaceholderData && rowCount === 0);
  const { list, loadMore } = useLoadMore(orders, query, rowCount);

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
        <div className="flex min-w-0 flex-col items-end gap-1">
          <Button
            aria-describedby={sound.needsGesture ? soundHint : undefined}
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
          {sound.needsGesture ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="order-sound-hint"
              id={soundHint}
            >
              {copy.soundHint}
            </p>
          ) : null}
        </div>
      </div>
      <OrderTabs query={query} />
      <OrderSearch query={query} />
      <output aria-live="polite" className="sr-only">
        {arrivals.message}
      </output>
      {waitsForList ? (
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
      <OrderListError orders={orders} />
      {items?.length === 0 && !orders.isPlaceholderData ? (
        <OrderListEmpty query={query} />
      ) : null}
      {items && items.length > 0 ? (
        <ul
          aria-label={copy.list}
          className="divide-y rounded-lg border"
          data-testid="order-list"
          ref={list}
        >
          {items.map((order) => (
            <OrderListRow
              from={query}
              isNew={isFreshArrival(arrivals.fresh, order, now)}
              key={order.id}
              now={now}
              order={order}
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
          onClick={loadMore}
          type="button"
          variant="outline"
        >
          {orders.isFetchingNextPage ? copy.loadingMore : copy.loadMore}
        </Button>
      ) : null}
    </section>
  );
}

/**
 * A read of the list that failed, with a retry: in place of the list when
 * none was read, and above the last one read when a refresh failed, so an
 * old list (an empty one too) never passes for the current one. A next page
 * that failed says so below the list instead.
 */
function OrderListError({
  orders,
}: {
  orders: Pick<
    ReturnType<typeof useOrders>,
    "isLoadingError" | "isRefetchError" | "refetch"
  >;
}) {
  const { admin, common } = useDictionary();

  if (!(orders.isLoadingError || orders.isRefetchError)) {
    return null;
  }

  return (
    <div className="space-y-2" role="alert">
      <p className="text-sm">
        {orders.isRefetchError
          ? admin.orders.errors.refresh
          : admin.orders.errors.load}
      </p>
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
  );
}

/** What an empty list says: of its status, or that nothing matches. */
function OrderListEmpty({ query }: { query: OrdersQuery }) {
  const copy = useDictionary().admin.orders;

  return (
    <EmptyState
      message={
        query.q
          ? interpolate(copy.empty.search, { q: query.q })
          : copy.empty[query.status ?? "all"]
      }
    />
  );
}

/** "All" and each status as links, each with its count once known. */
function OrderTabs({ query }: { query: OrdersQuery }) {
  const copy = useDictionary().admin.orders;
  const locale = useLocale();
  const counts = useOrderCounts();

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
                href={ordersPath(locale, { q: query.q, status })}
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
  from,
  isNew,
  now,
  order,
}: {
  /** The list's selection, carried to the order and back. */
  from: OrdersQuery;
  isNew: boolean;
  now: number;
  order: OrderRow;
}) {
  const copy = useDictionary().admin.orders;
  const locale = useLocale();
  const createdAt = new Date(order.createdAt);

  return (
    <li data-testid={`order-row-${order.code}`}>
      <Link
        className="flex flex-col gap-1 p-3 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href={orderPath(order.id, locale, from)}
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
