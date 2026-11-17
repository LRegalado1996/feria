"use client";

import { ChevronRight, Sparkles, Volume2, VolumeX } from "lucide-react";
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
import { AdminPage } from "@/app/_components/molecules/admin-page";
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

/**
 * A row's columns, shared by the column names above the rows from `xl` up.
 * The fixed ones take 36rem: beside the 16rem sidebar, a narrower window
 * left the customer's column 14 px at 1024 px.
 */
const ORDER_ROW_COLUMNS =
  "grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[8rem_minmax(0,1fr)_9rem_11rem_7rem_1rem]";

/**
 * Where a row's parts sit: a card below `xl` (the code and the total, the
 * customer and their phone, the status and the age), one line of columns
 * from `xl` up. The parts keep the order a screen reader says them in.
 */
const ORDER_ROW_AREAS =
  "[grid-template-areas:'code_total'_'who_who'_'phone_phone'_'status_time'] xl:[grid-template-areas:'code_who_time_status_total_chevron'_'code_phone_time_status_total_chevron']";

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
    <section data-slot="order-manager" data-testid="order-manager">
      <AdminPage
        actions={
          // A setting of the screen, not its main action: it stays in the
          // top bar at every width, its words only for the ear on a phone.
          <Button
            aria-describedby={sound.needsGesture ? soundHint : undefined}
            aria-pressed={sound.enabled === true}
            className="w-11 md:w-auto"
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
            <span className="sr-only md:not-sr-only">{copy.sound}</span>
          </Button>
        }
        notice={
          sound.needsGesture ? (
            <p data-testid="order-sound-hint" id={soundHint}>
              {copy.soundHint}
            </p>
          ) : null
        }
        title={copy.title}
      >
        <p className="text-sm text-muted-foreground">{copy.description}</p>
        <div className="space-y-3">
          <OrderTabs query={query} />
          <OrderSearch className="md:max-w-sm" query={query} />
        </div>
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
              <Skeleton className="h-28 w-full rounded-lg xl:h-14" key={row} />
            ))}
          </div>
        ) : null}
        <OrderListError orders={orders} />
        {items?.length === 0 && !orders.isPlaceholderData ? (
          <OrderListEmpty query={query} />
        ) : null}
        {items && items.length > 0 ? (
          // From `xl` up one card of rows under their column names; below
          // it every row is a card of its own.
          <div className="xl:overflow-hidden xl:rounded-lg xl:border xl:bg-card">
            <div
              aria-hidden="true"
              className={cn(
                "hidden h-10 items-center gap-x-4 border-b bg-muted/50 px-4 text-xs text-muted-foreground xl:grid",
                ORDER_ROW_COLUMNS
              )}
              data-testid="order-list-columns"
            >
              <span>{copy.columns.code}</span>
              <span>{copy.columns.customer}</span>
              <span>{copy.columns.placed}</span>
              <span>{copy.columns.status}</span>
              <span className="text-right">{copy.columns.total}</span>
            </div>
            <ul
              aria-label={copy.list}
              className="space-y-2 xl:space-y-0 xl:divide-y"
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
          </div>
        ) : null}
        {orders.isFetchNextPageError ? (
          <p className="text-sm" role="alert">
            {copy.errors.loadMore}
          </p>
        ) : null}
        {orders.hasNextPage ? (
          <Button
            aria-disabled={orders.isFetchingNextPage || undefined}
            className="w-full aria-disabled:opacity-50 md:w-auto"
            onClick={loadMore}
            type="button"
            variant="outline"
          >
            {orders.isFetchingNextPage ? copy.loadingMore : copy.loadMore}
          </Button>
        ) : null}
      </AdminPage>
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
    <div
      className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
      role="alert"
    >
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
      className="rounded-lg border bg-card px-6"
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
      {/* Its own scroll box, padded so a focus ring is not cut off. */}
      <ul className="-m-1 flex gap-2 overflow-x-auto overflow-y-clip p-1">
        {[undefined, ...ORDER_STATUSES].map((status) => {
          const label = status ? copy.statuses[status] : copy.tabAll;
          const count = tabCount(status);
          const current = query.status === status;

          return (
            <li className="shrink-0" key={status ?? "all"}>
              <Link
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center rounded-full border px-4 text-sm whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:h-8 md:px-3",
                  current
                    ? "border-foreground bg-foreground font-semibold text-background"
                    : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
        className={cn(
          "grid gap-x-4 gap-y-1 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset xl:rounded-none xl:border-0 xl:bg-transparent xl:px-4 xl:py-3",
          ORDER_ROW_COLUMNS,
          ORDER_ROW_AREAS
        )}
        href={orderPath(order.id, locale, from)}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2 [grid-area:code] xl:self-center">
          <span className="font-mono text-sm font-semibold">{order.code}</span>
          {isNew ? (
            <span
              className="inline-flex h-6 items-center gap-1 rounded-full bg-primary px-2.5 text-xs font-medium text-primary-foreground"
              data-testid="order-new"
            >
              <Sparkles aria-hidden="true" className="size-3.5" />
              {copy.new}
            </span>
          ) : null}
        </span>
        <OrderStatusBadge
          className="mt-2 self-center justify-self-start [grid-area:status] xl:mt-0"
          status={order.status}
        />
        <span className="mt-1 min-w-0 truncate text-base font-medium [grid-area:who] xl:mt-0 xl:self-end xl:text-sm">
          {order.customerName}
        </span>
        <span className="self-center text-right text-base font-semibold tabular-nums [grid-area:total] xl:text-sm">
          {formatPrice(order.totalAmount, order.currencyCode, locale)}
        </span>
        <time
          className="mt-2 self-center text-right text-xs text-muted-foreground [grid-area:time] xl:mt-0 xl:text-left"
          dateTime={createdAt.toISOString()}
        >
          {formatRelativeTime(createdAt, now, locale)}
        </time>
        <OrderPhoneVerified
          className="text-xs text-muted-foreground [grid-area:phone] xl:self-start"
          verified={order.phoneVerified}
        />
        <ChevronRight
          aria-hidden="true"
          className="hidden size-4 self-center text-muted-foreground [grid-area:chevron] xl:block"
        />
      </Link>
    </li>
  );
}

export { OrderManager };
