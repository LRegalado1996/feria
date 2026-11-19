import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import type { MockDatabase } from "@/server/test/context";

import {
  createStorefrontSwitch,
  isStorefrontClosed,
  SWITCH_TIMEOUT_MS,
  SWITCH_TTL_MS,
} from "./storefront-switch";

const { captureExceptionWithScope } = vi.hoisted(() => ({
  captureExceptionWithScope: vi.fn<
    (error: unknown, scope: { action: string }) => string | null
  >(() => null),
}));

vi.mock("@/lib/sentry", () => ({ captureExceptionWithScope }));

const TTL = 5000;
const TIMEOUT = 2000;

/**
 * A switch over a database double: `answers` are what each read returns in
 * turn (`true` published, an `Error` thrown, `"hang"` never settling), on a
 * clock the test moves.
 */
function setup(answers: (boolean | Error | "hang")[]) {
  const clock = { now: 1_000_000 };
  const queue = [...answers];
  const read = vi.fn(async (): Promise<boolean> => {
    const answer = queue.shift();

    if (answer === "hang") {
      return await new Promise<boolean>(() => {});
    }

    if (answer instanceof Error) {
      throw answer;
    }

    if (answer === undefined) {
      throw new Error("read more often than the test expected");
    }

    return answer;
  });
  const report = vi.fn<(error: unknown) => void>();
  const storefront = createStorefrontSwitch({
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
    read,
    report,
    storefront,
  };
}

describe("createStorefrontSwitch", () => {
  test.each([
    [true, true],
    [false, false],
  ])("published %s reads as closed %s", async (published, closed) => {
    const { storefront } = setup([published]);

    await expect(storefront.isClosed()).resolves.toBe(closed);
  });

  test("trusts what it read for the window, and reads again once it has passed", async () => {
    const { advance, read, storefront } = setup([true, false]);

    await expect(storefront.isClosed()).resolves.toBe(true);
    advance(TTL - 1);
    await expect(storefront.isClosed()).resolves.toBe(true);
    expect(read.mock.calls).toEqual([[]]);

    advance(1);
    await expect(storefront.isClosed()).resolves.toBe(false);
    expect(read.mock.calls).toEqual([[], []]);
  });

  test("requests that arrive together share one read", async () => {
    const { read, storefront } = setup([false]);

    await expect(
      Promise.all([storefront.isClosed(), storefront.isClosed()])
    ).resolves.toEqual([false, false]);
    expect(read.mock.calls).toEqual([[]]);
  });

  test("fails closed: a read that throws is reported, and the store is closed for the window", async () => {
    const outage = new Error("connection refused");
    const { advance, read, report, storefront } = setup([outage, false]);

    await expect(storefront.isClosed()).resolves.toBe(true);
    expect(report).toHaveBeenCalledExactlyOnceWith(outage);

    // The outage costs one read per window, not one per request.
    advance(TTL - 1);
    await expect(storefront.isClosed()).resolves.toBe(true);
    expect(read.mock.calls).toEqual([[]]);

    advance(1);
    await expect(storefront.isClosed()).resolves.toBe(false);
  });

  test("fails closed when the database does not answer in time", async () => {
    vi.useFakeTimers();
    const { report, storefront } = setup(["hang"]);

    const closed = storefront.isClosed();
    await vi.advanceTimersByTimeAsync(TIMEOUT - 1);
    expect(report).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(closed).resolves.toBe(true);
    expect(report).toHaveBeenCalledExactlyOnceWith(
      new Error(`The storefront switch took over ${TIMEOUT} ms`)
    );
  });
});

describe("isStorefrontClosed", () => {
  // One test: the switch it reads is the module's own, remembered across calls.
  test("reads the switch's one column through the service, failing closed with a report, then trusting the next answer for its window", async () => {
    vi.setSystemTime(new Date("2026-11-18T12:00:00.000Z"));
    // `@/server/db` is the passive double for every unit test (setup-common).
    const database = db as unknown as MockDatabase;
    const outage = new Error("connection refused");
    database.$["select.limit"]
      .mockRejectedValueOnce(outage)
      .mockResolvedValueOnce([{ published: false }]);

    await expect(isStorefrontClosed()).resolves.toBe(true);
    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(outage, {
      action: "ComingSoon.read_switch",
    });

    vi.setSystemTime(new Date("2026-11-18T12:00:05.000Z"));
    await expect(isStorefrontClosed()).resolves.toBe(false);
    expect(database.$["select.limit"].mock.calls).toEqual([[1], [1]]);
    // Short enough for a flip to show in seconds; long enough to spare the
    // database a read per page.
    expect([SWITCH_TTL_MS, SWITCH_TIMEOUT_MS]).toEqual([5000, 5000]);
  });
});
