import { describe, expect, test, vi } from "vitest";

import type { StoreAddresses } from "@/lib/catalog/store-address";
import { db } from "@/server/db";
import { createMockDatabase, type MockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import {
  ADDRESSES_STATEMENT_TIMEOUT_MS,
  ADDRESSES_TIMEOUT_MS,
  ADDRESSES_TTL_MS,
  createStoreAddressBook,
  currentStoreAddresses,
  storeAddressesSince,
} from "./store-addresses";

const { captureExceptionWithScope } = vi.hoisted(() => ({
  captureExceptionWithScope: vi.fn<
    (error: unknown, scope: { action: string }) => string | null
  >(() => null),
}));

vi.mock("@/lib/sentry", () => ({ captureExceptionWithScope }));

const TTL = 5000;
const TIMEOUT = 2000;

/** A store whose one address is the category `slug`. */
function makeAddresses(slug: string): StoreAddresses {
  return { categories: [{ path: `/${slug}`, slug }], pages: [] };
}

const FIRST = makeAddresses("primera");
const SECOND = makeAddresses("segunda");

/**
 * A read that answers `addresses` once the test calls `settle`, or throws
 * once it calls `fail`.
 */
function deferredRead() {
  let settle: (addresses: StoreAddresses) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const answer = new Promise<StoreAddresses>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  return { answer, fail, settle };
}

/**
 * A book over a read double: `answers` are what each read returns in turn
 * (addresses, an `Error` thrown, `"hang"` never settling, or a promise the
 * test settles), on a clock the test moves; `fakeTimers` also puts the
 * time limit's timer on the test's clock.
 */
function setup(
  answers: (Error | Promise<StoreAddresses> | StoreAddresses | "hang")[],
  { fakeTimers = false }: { fakeTimers?: boolean } = {}
) {
  if (fakeTimers) {
    vi.useFakeTimers();
  }

  const clock = { now: 1_000_000 };
  const queue = [...answers];
  const read = vi.fn(async (): Promise<StoreAddresses | null> => {
    const answer = queue.shift();

    if (answer === "hang") {
      return await new Promise<StoreAddresses>(() => {});
    }

    if (answer instanceof Error) {
      throw answer;
    }

    if (answer === undefined) {
      throw new Error("read more often than the test expected");
    }

    return await answer;
  });
  const report = vi.fn<(error: unknown) => void>();
  const book = createStoreAddressBook({
    now: () => clock.now,
    read,
    report,
    timeoutMs: TIMEOUT,
    ttlMs: TTL,
  });

  return {
    advance: (ms: number) => {
      clock.now += ms;
    },
    book,
    clock,
    read,
    report,
  };
}

describe("createStoreAddressBook: current", () => {
  test("trusts what it read for the window, and reads again once it has passed", async () => {
    const { advance, book, read } = setup([FIRST, SECOND]);

    await expect(book.current()).resolves.toBe(FIRST);
    advance(TTL - 1);
    await expect(book.current()).resolves.toBe(FIRST);
    expect(read.mock.calls).toEqual([[]]);

    advance(1);
    await expect(book.current()).resolves.toBe(SECOND);
    expect(read.mock.calls).toEqual([[], []]);
  });

  test("requests that arrive together share one read", async () => {
    const { book, read } = setup([FIRST]);

    await expect(
      Promise.all([book.current(), book.current()])
    ).resolves.toEqual([FIRST, FIRST]);
    expect(read.mock.calls).toEqual([[]]);
  });

  test("fails open: a read that throws is reported and answers null for the window, one read per window", async () => {
    const outage = new Error("connection refused");
    const { advance, book, read, report } = setup([outage, FIRST]);

    await expect(book.current()).resolves.toBeNull();
    expect(report).toHaveBeenCalledExactlyOnceWith(outage);
    advance(TTL - 1);
    await expect(book.current()).resolves.toBeNull();
    expect(read.mock.calls).toEqual([[]]);

    advance(1);
    await expect(book.current()).resolves.toBe(FIRST);
  });

  test("a slow failure counts its window from when it failed", async () => {
    const SLOW = 4000;
    const outage = new Error("connection refused");
    const { advance, book, read } = setup([FIRST]);
    read.mockImplementationOnce(async () => {
      advance(SLOW);
      return await Promise.reject(outage);
    });

    await expect(book.current()).resolves.toBeNull();
    advance(TTL - 1);
    await expect(book.current()).resolves.toBeNull();
    expect(read.mock.calls).toEqual([[]]);

    advance(1);
    await expect(book.current()).resolves.toBe(FIRST);
  });

  test("answers null when the database does not answer in time", async () => {
    const { book, report } = setup(["hang"], { fakeTimers: true });

    const addresses = book.current();
    await vi.advanceTimersByTimeAsync(TIMEOUT - 1);
    expect(report).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(addresses).resolves.toBeNull();
    expect(report).toHaveBeenCalledExactlyOnceWith(
      new Error(`The store's addresses took over ${TIMEOUT} ms`)
    );
  });
});

describe("createStoreAddressBook: since", () => {
  test("a read that started at or after the time is enough: no new one", async () => {
    const { book, clock, read } = setup([FIRST]);
    const arrived = clock.now;

    await book.current();

    await expect(book.since(arrived)).resolves.toBe(FIRST);
    expect(read.mock.calls).toEqual([[]]);
  });

  test("a read that started before the time is not: it reads again, and the new read is the one kept", async () => {
    const { advance, book, clock, read } = setup([FIRST, SECOND]);

    await book.current();
    advance(1);

    await expect(book.since(clock.now)).resolves.toBe(SECOND);
    expect(read.mock.calls).toEqual([[], []]);
    await expect(book.current()).resolves.toBe(SECOND);
  });

  test("joins a read that started at or after the time and is still running", async () => {
    const running = deferredRead();
    const { book, clock, read } = setup([running.answer]);
    const arrived = clock.now;

    const first = book.current();
    const fresh = book.since(arrived);
    running.settle(FIRST);

    await expect(Promise.all([first, fresh])).resolves.toEqual([FIRST, FIRST]);
    expect(read.mock.calls).toEqual([[]]);
  });

  test("does not join a running read that started before the time, and an older read finishing last does not replace the newer", async () => {
    const older = deferredRead();
    const { advance, book, clock, read } = setup([older.answer, SECOND]);

    const stale = book.current();
    advance(1);
    await expect(book.since(clock.now)).resolves.toBe(SECOND);
    older.settle(FIRST);

    await expect(stale).resolves.toBe(FIRST);
    expect(read.mock.calls).toEqual([[], []]);
    await expect(book.current()).resolves.toBe(SECOND);
  });

  test("an older read failing after a newer one succeeded leaves the newer one kept", async () => {
    const older = deferredRead();
    const outage = new Error("connection reset");
    const { advance, book, clock, read, report } = setup([
      older.answer,
      SECOND,
    ]);

    const stale = book.current();
    advance(1);
    await expect(book.since(clock.now)).resolves.toBe(SECOND);
    advance(1);
    older.fail(outage);

    await expect(stale).resolves.toBeNull();
    expect(report).toHaveBeenCalledExactlyOnceWith(outage);
    // The newer read is still trusted for its window: no read, no null.
    await expect(book.current()).resolves.toBe(SECOND);
    expect(read.mock.calls).toEqual([[], []]);
  });

  test("a request after the newer read ended starts its own, while the older one still runs", async () => {
    const older = deferredRead();
    const { advance, book, clock, read } = setup([older.answer, SECOND, FIRST]);

    const stale = book.current();
    advance(1);
    await book.since(clock.now);
    advance(1);
    // The older read is still running, but it started before this request.
    await expect(book.since(clock.now)).resolves.toBe(FIRST);
    older.settle(SECOND);
    await stale;

    expect(read.mock.calls).toEqual([[], [], []]);
  });
});

describe("currentStoreAddresses and storeAddressesSince", () => {
  // One test: the book they read is the module's own, remembered across calls.
  test("read the store's addresses through the service, under a server-side limit, and trust them for the window", async () => {
    vi.setSystemTime(new Date("2026-11-25T12:00:00.000Z"));
    const database = db as unknown as MockDatabase;
    const tx = createMockDatabase();
    database.$.transaction.mockImplementation(async (callback: unknown) =>
      typeof callback === "function" ? await callback(tx) : undefined
    );
    const outage = new Error("connection refused");
    tx.query.store.findFirst
      .mockRejectedValueOnce(outage)
      .mockResolvedValueOnce({ categories: [], homePageId: null, id: 7 });

    await expect(currentStoreAddresses()).resolves.toBeNull();
    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(outage, {
      action: "Storefront.read_addresses",
    });

    await expect(storeAddressesSince(Date.now() + 1)).resolves.toEqual({
      categories: [],
      pages: [],
    });
    expect(database.$.transaction.mock.calls).toEqual([
      [expect.any(Function)],
      [expect.any(Function)],
    ]);
    expect(
      tx.$.execute.mock.calls.map(([query]) => renderQuery(query))
    ).toEqual(
      Array.from({ length: 2 }, () => ({
        params: ["4000"],
        sql: "select set_config('statement_timeout', $1, true)",
      }))
    );
    expect(database.query.store.findFirst).not.toHaveBeenCalled();
    // A page let through can be a few seconds behind the admin; the
    // server gives up before the proxy does.
    expect([
      ADDRESSES_TTL_MS,
      ADDRESSES_TIMEOUT_MS,
      ADDRESSES_STATEMENT_TIMEOUT_MS,
    ]).toEqual([5000, 5000, 4000]);
  });
});
