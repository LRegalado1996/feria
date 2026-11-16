import type { OrdersQuery } from "@/lib/admin/orders";
import type { OrderStatus } from "@/lib/schemas/order";

/** How long an arrival stays marked "New" on the orders screen. */
export const ARRIVAL_FRESH_MS = 10 * 60_000;

/** What this needs of an order in a list. */
interface ListedOrder {
  code: string;
  /** The database's stamp, which the list is sorted by, newest first. */
  createdAt: Date;
  id: number;
  status: OrderStatus;
}

/** A place in a list's order: when the order was placed, then its id. */
interface ListPlace {
  createdAt: number;
  id: number;
}

/** The last list that brought arrivals: their codes, in the list's order. */
export interface Arrival {
  codes: readonly string[];
  /** Counts every arrival in the tab, so a screen tells its own from older. */
  seq: number;
}

interface TabArrivals {
  /**
   * The lists (status and search) this tab has read at least once, each
   * with the newest place it has shown (`null` while it has shown none).
   */
  baselines: Map<string, ListPlace | null>;
  /** Each order still marked "New", with the instant this tab saw it come. */
  fresh: ReadonlyMap<number, number>;
  /** Every order this tab has seen in the lists or opened. */
  known: Set<number>;
  last: Arrival | null;
}

/** No order marked "New": what a tab that has read nothing yet holds. */
export const NO_ARRIVALS: ReadonlyMap<number, number> = new Map();

function noArrivals(): TabArrivals {
  return {
    baselines: new Map(),
    fresh: NO_ARRIVALS,
    known: new Set(),
    last: null,
  };
}

/**
 * Which orders this tab has seen (FER-027). Module state, so it lives as long
 * as the tab's JavaScript: moving from the list to an order and back keeps
 * it, and an order placed meanwhile is new on return. A reload starts it
 * empty, so the first list after one announces nothing; that is accepted, as
 * the staff sees the whole list then anyway. It is written only from effects
 * and event handlers, never on the server, where one module serves every
 * request.
 */
let arrivals = noArrivals();
const listeners = new Set<() => void>();
let arrivalCount = 0;

function publish(fresh: Map<number, number>) {
  // A new map, so `useSyncExternalStore` sees the change.
  arrivals.fresh = fresh;

  for (const listener of listeners) {
    listener();
  }
}

function listKey({ q, status }: OrdersQuery) {
  return JSON.stringify([status ?? null, q ?? null]);
}

function placeOf(order: ListedOrder): ListPlace {
  return { createdAt: new Date(order.createdAt).getTime(), id: order.id };
}

/** Whether `place` sorts ahead of `than`: placed later, or the higher id. */
function isNewer(place: ListPlace, than: ListPlace | null) {
  return (
    than === null ||
    place.createdAt > than.createdAt ||
    (place.createdAt === than.createdAt && place.id > than.id)
  );
}

/**
 * Records what a list brought and returns its arrivals: the
 * orders on its first page this tab had never seen, placed after the newest
 * the list had shown. The first read of each list (a status, a search) only
 * learns what is there: a tab or search the staff had not opened holds older
 * orders, not arrivals. Later pages ("Load more") are older orders too,
 * learned silently, and so is an older order the first page brings up when
 * one above it leaves the list (packed, say): it was only below the page's
 * end. The stamps compared are all the database's, and the store's orders
 * are stamped one at a time after its lock (`createOrder`), so a later stamp
 * is a later commit: no order that arrives can carry an older one.
 */
export function recordOrderList<T extends ListedOrder>(
  query: OrdersQuery,
  pages: readonly (readonly T[])[],
  now: number
): T[] {
  const key = listKey(query);
  const firstRead = !arrivals.baselines.has(key);
  const boundary = arrivals.baselines.get(key) ?? null;
  const [newest = [], ...older] = pages;
  const arrived = firstRead
    ? []
    : newest.filter(
        (order) =>
          !arrivals.known.has(order.id) && isNewer(placeOf(order), boundary)
      );
  const fresh = new Map(arrivals.fresh);
  let changed = false;
  let shown = boundary;

  for (const order of [...newest, ...older.flat()]) {
    arrivals.known.add(order.id);
    const place = placeOf(order);

    if (isNewer(place, shown)) {
      shown = place;
    }

    if (order.status !== "received" && fresh.delete(order.id)) {
      changed = true;
    }
  }

  arrivals.baselines.set(key, shown);

  // Only a received arrival is marked "New": one that came already packed
  // (an empty list's first read, then the "all" tab) is said, but staff
  // moving it back to received later must not make it new then.
  for (const order of arrived) {
    if (order.status === "received") {
      fresh.set(order.id, now);
      changed = true;
    }
  }

  if (arrived.length > 0) {
    arrivalCount += 1;
    arrivals.last = {
      codes: arrived.map((order) => order.code),
      seq: arrivalCount,
    };
  }

  // An arrival is said (and beeped) even when it marks nothing new, as a
  // packed one does: subscribers hear of every arrival.
  if (changed || arrived.length > 0) {
    publish(fresh);
  }

  return arrived;
}

/** An order the staff opened: known, and no longer new. */
export function markOrderSeen(id: number) {
  arrivals.known.add(id);

  if (arrivals.fresh.has(id)) {
    const fresh = new Map(arrivals.fresh);
    fresh.delete(id);
    publish(fresh);
  }
}

/** The orders marked "New", by id, with when each arrived. */
export function freshArrivals(): ReadonlyMap<number, number> {
  return arrivals.fresh;
}

/** The last arrivals, or `null` before this tab saw any. */
export function lastArrival(): Arrival | null {
  return arrivals.last;
}

/** Calls `listener` whenever the arrivals or the "New" marks change. */
export function subscribeArrivals(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Whether the screen marks `order` "New" at `now`: it arrived while this tab
 * watched, nobody opened it here, it is still received, and fewer than ten
 * minutes passed.
 */
export function isFreshArrival(
  fresh: ReadonlyMap<number, number>,
  order: ListedOrder,
  now: number
) {
  const arrivedAt = fresh.get(order.id);

  return (
    arrivedAt !== undefined &&
    order.status === "received" &&
    now - arrivedAt < ARRIVAL_FRESH_MS
  );
}

/** Forgets every order seen, as a reload does: for tests, between them. */
export function forgetOrderArrivals() {
  arrivals = noArrivals();
  arrivalCount = 0;
}
