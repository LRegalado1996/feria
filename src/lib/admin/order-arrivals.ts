import type { OrdersQuery } from "@/lib/admin/orders";
import type { OrderStatus } from "@/lib/schemas/order";

/** How long an arrival stays marked "New" on the orders screen. */
export const ARRIVAL_FRESH_MS = 10 * 60_000;

/** What the store needs of an order in a list. */
interface ListedOrder {
  code: string;
  id: number;
  status: OrderStatus;
}

/** The last list that brought arrivals: their codes, in the list's order. */
export interface Arrival {
  codes: readonly string[];
  /** Counts every arrival in the tab, so a screen tells its own from older. */
  seq: number;
}

interface StoreArrivals {
  /** The lists (status and search) this tab has read at least once. */
  baselines: Set<string>;
  /** Each order still marked "New", with the instant this tab saw it come. */
  fresh: ReadonlyMap<number, number>;
  /** Every order this tab has seen in the store's lists or opened. */
  known: Set<number>;
  last: Arrival | null;
}

/**
 * Which orders this tab has seen, per store (FER-027). Module state, so it
 * lives as long as the tab's JavaScript: moving from the list to an order and
 * back keeps it, and an order placed meanwhile is new on return. A reload
 * starts it empty, so the first list after one announces nothing; that is
 * accepted, as the staff sees the whole list then anyway. It is written
 * only from effects and event handlers, never on the server, where one
 * module serves every request.
 */
const stores = new Map<string, StoreArrivals>();
const listeners = new Set<() => void>();
let arrivalCount = 0;

/** The arrivals of a store this tab has not read yet: none. */
export const NO_ARRIVALS: ReadonlyMap<number, number> = new Map();

function storeArrivals(storeSlug: string): StoreArrivals {
  const existing = stores.get(storeSlug);

  if (existing) {
    return existing;
  }

  const created: StoreArrivals = {
    baselines: new Set(),
    fresh: NO_ARRIVALS,
    known: new Set(),
    last: null,
  };
  stores.set(storeSlug, created);

  return created;
}

function publish(arrivals: StoreArrivals, fresh: Map<number, number>) {
  // A new map, so `useSyncExternalStore` sees the change.
  arrivals.fresh = fresh;

  for (const listener of listeners) {
    listener();
  }
}

function listKey({ q, status }: OrdersQuery) {
  return JSON.stringify([status ?? null, q ?? null]);
}

/**
 * Records what a list of the store brought and returns its arrivals: the
 * orders on its first page this tab had never seen. The first read of each
 * list (a status, a search) only learns what is there: a tab or search the
 * staff had not opened holds older orders, not arrivals. Later pages
 * ("Load more") are older orders too, learned silently. An order no longer
 * received stops being new.
 */
export function recordOrderList<T extends ListedOrder>(
  storeSlug: string,
  query: OrdersQuery,
  pages: readonly (readonly T[])[],
  now: number
): T[] {
  const arrivals = storeArrivals(storeSlug);
  const key = listKey(query);
  const firstRead = !arrivals.baselines.has(key);
  const [newest = [], ...older] = pages;
  const arrived = firstRead
    ? []
    : newest.filter((order) => !arrivals.known.has(order.id));
  const fresh = new Map(arrivals.fresh);
  let changed = false;

  arrivals.baselines.add(key);

  for (const order of [...newest, ...older.flat()]) {
    arrivals.known.add(order.id);

    if (order.status !== "received" && fresh.delete(order.id)) {
      changed = true;
    }
  }

  for (const order of arrived) {
    fresh.set(order.id, now);
    changed = true;
  }

  if (arrived.length > 0) {
    arrivalCount += 1;
    arrivals.last = {
      codes: arrived.map((order) => order.code),
      seq: arrivalCount,
    };
  }

  if (changed) {
    publish(arrivals, fresh);
  }

  return arrived;
}

/** An order the staff opened: known, and no longer new. */
export function markOrderSeen(storeSlug: string, id: number) {
  const arrivals = storeArrivals(storeSlug);
  arrivals.known.add(id);

  if (arrivals.fresh.has(id)) {
    const fresh = new Map(arrivals.fresh);
    fresh.delete(id);
    publish(arrivals, fresh);
  }
}

/** The store's orders marked "New", by id, with when each arrived. */
export function freshArrivals(storeSlug: string): ReadonlyMap<number, number> {
  return stores.get(storeSlug)?.fresh ?? NO_ARRIVALS;
}

/** The store's last arrivals, or `null` before this tab saw any. */
export function lastArrival(storeSlug: string): Arrival | null {
  return stores.get(storeSlug)?.last ?? null;
}

/** Calls `listener` whenever any store's arrivals or "New" marks change. */
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

/** Forgets every store, as a reload does: for tests, between them. */
export function forgetOrderArrivals() {
  stores.clear();
  arrivalCount = 0;
}
