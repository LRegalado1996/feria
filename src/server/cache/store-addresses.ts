import type { StoreAddresses } from "@/lib/catalog/store-address";
import { captureExceptionWithScope } from "@/lib/sentry";
import { within } from "@/lib/utils/within";
import { db } from "@/server/db";
import { withStatementTimeout } from "@/server/db/statement-timeout";
import { listStoreAddresses } from "@/server/services/store-address";

/**
 * How long one instance trusts the addresses it read to let a page
 * through. Next runs no `"use cache"` in the proxy and the proxy shares no
 * memory with the functions that save, so no tag reaches this read: a
 * category or a page deleted from the admin still reaches its route for
 * this long, which answers it the way it did before FER-069 (the
 * not-found page, with a 200). Anything but a page let through is decided
 * on a read that started after the request arrived (below).
 */
export const ADDRESSES_TTL_MS = 5000;

/**
 * How long a page request waits for the addresses before it gives up and
 * lets the request through to its route, which still answers it. Long
 * enough for a database waking from idle, like the launch switch's.
 */
export const ADDRESSES_TIMEOUT_MS = 5000;

/**
 * How long Postgres runs the read before it cancels it: under the wait, so
 * a stalled read hands its connection back before the next one starts.
 */
export const ADDRESSES_STATEMENT_TIMEOUT_MS = 4000;

interface StoreAddressBookOptions {
  now: () => number;
  /** The store's addresses, `null` before its row exists. */
  read: () => Promise<StoreAddresses | null>;
  report: (error: unknown) => void;
  timeoutMs: number;
  ttlMs: number;
}

interface Snapshot {
  /** `null` when the read failed or the store has no row yet. */
  addresses: StoreAddresses | null;
  /** When the read that made it started. */
  askedAt: number;
}

/**
 * The store's addresses as the proxy reads them. `current()` is the last
 * read, trusted for `ttlMs`; `since(time)` is a read that started at or
 * after `time`, so an address created a moment ago is never answered from
 * an older read. Requests that arrive together share one read. A read that
 * throws or outlasts `timeoutMs` is reported and answers `null`, "unknown",
 * which lets every request through for a window instead of turning a
 * database outage into a site of 404s, and costs one wait per window.
 */
export function createStoreAddressBook({
  now,
  read,
  report,
  timeoutMs,
  ttlMs,
}: StoreAddressBookOptions) {
  let known: Snapshot | null = null;
  let pending: { askedAt: number; snapshot: Promise<Snapshot> } | null = null;

  async function load(askedAt: number): Promise<Snapshot> {
    try {
      const addresses = await within(
        read(),
        timeoutMs,
        "The store's addresses"
      );

      return { addresses, askedAt };
    } catch (error) {
      report(error);

      // A failure counts from when it was known, like the launch switch's.
      return { addresses: null, askedAt: now() };
    }
  }

  async function start(): Promise<Snapshot> {
    const askedAt = now();
    const snapshot = load(askedAt);
    pending = { askedAt, snapshot };
    const loaded = await snapshot;

    // Two reads can overlap (a fresh one asked for while another runs): the
    // one that started later is the one kept.
    if (!known || loaded.askedAt >= known.askedAt) {
      known = loaded;
    }

    if (pending?.snapshot === snapshot) {
      pending = null;
    }

    return loaded;
  }

  return {
    /** The last read while it is under `ttlMs` old, else a new one. */
    async current(): Promise<StoreAddresses | null> {
      if (known && now() < known.askedAt + ttlMs) {
        return known.addresses;
      }

      return (await (pending?.snapshot ?? start())).addresses;
    },

    /** A read that started at or after `time`: the last, a running one, or a new one. */
    async since(time: number): Promise<StoreAddresses | null> {
      if (known && known.askedAt >= time) {
        return known.addresses;
      }

      if (pending && pending.askedAt >= time) {
        return (await pending.snapshot).addresses;
      }

      return (await start()).addresses;
    },
  };
}

const storeAddressBook = createStoreAddressBook({
  now: () => Date.now(),
  read: async () =>
    await withStatementTimeout(
      db,
      ADDRESSES_STATEMENT_TIMEOUT_MS,
      async (tx) => await listStoreAddresses(tx)
    ),
  report: (error) => {
    captureExceptionWithScope(error, { action: "Storefront.read_addresses" });
  },
  timeoutMs: ADDRESSES_TIMEOUT_MS,
  ttlMs: ADDRESSES_TTL_MS,
});

/** The store's addresses the proxy last read, trusted for a few seconds. */
export async function currentStoreAddresses(): Promise<StoreAddresses | null> {
  return await storeAddressBook.current();
}

/** The store's addresses from a read that started at or after `time`. */
export async function storeAddressesSince(
  time: number
): Promise<StoreAddresses | null> {
  return await storeAddressBook.since(time);
}
