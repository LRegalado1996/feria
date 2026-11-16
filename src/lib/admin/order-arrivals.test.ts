import { afterEach, describe, expect, test, vi } from "vitest";

import type { OrderStatus } from "@/lib/schemas/order";

import {
  ARRIVAL_FRESH_MS,
  forgetOrderArrivals,
  freshArrivals,
  isFreshArrival,
  lastArrival,
  markOrderSeen,
  NO_ARRIVALS,
  recordOrderList,
  subscribeArrivals,
} from "./order-arrivals";

afterEach(() => {
  forgetOrderArrivals();
});

const AT = Date.parse("2026-11-14T22:00:00.000Z");

/**
 * An order as a list holds it: ids and stamps rise together, as the store's
 * one-at-a-time ordering makes them, unless the stamp is given.
 */
function makeOrder(
  id: number,
  status: OrderStatus = "received",
  createdAt = new Date(AT - 3_600_000 + id * 1000)
) {
  return { code: `C${String(id)}`, createdAt, id, status };
}

/** A store whose received list was read once, holding orders 1 and 2. */
function setup() {
  const listener = vi.fn<() => void>();
  const unsubscribe = subscribeArrivals(listener);
  const first = recordOrderList(
    { status: "received" },
    [[makeOrder(2), makeOrder(1)]],
    AT
  );

  return {
    first,
    listener,
    poll: (pages: ReturnType<typeof makeOrder>[][], now = AT + 1000) =>
      recordOrderList({ status: "received" }, pages, now),
    unsubscribe,
  };
}

describe("recordOrderList", () => {
  test("the first read of a list announces nothing and marks nothing new", () => {
    const { first, listener } = setup();

    expect(first).toEqual([]);
    expect(freshArrivals()).toBe(NO_ARRIVALS);
    expect(listener).not.toHaveBeenCalled();
  });

  test("an order a later read brings on its first page is an arrival, new from then", () => {
    const { listener, poll } = setup();

    expect(poll([[makeOrder(3), makeOrder(2), makeOrder(1)]])).toEqual([
      makeOrder(3),
    ]);
    expect([...freshArrivals()]).toEqual([[3, AT + 1000]]);
    expect(listener).toHaveBeenCalledExactlyOnceWith();
  });

  test("an arrival is said once: the next read of the same list is quiet", () => {
    const { listener, poll } = setup();
    poll([[makeOrder(3), makeOrder(2)]]);

    expect(poll([[makeOrder(3), makeOrder(2)]], AT + 2000)).toEqual([]);
    expect([...freshArrivals()]).toEqual([[3, AT + 1000]]);
    expect(listener).toHaveBeenCalledExactlyOnceWith();
  });

  test("older pages a later read brings (Load more) are learned, never announced", () => {
    const { poll } = setup();

    expect(poll([[makeOrder(2), makeOrder(1)], [makeOrder(0)]])).toEqual([]);
    expect(freshArrivals()).toBe(NO_ARRIVALS);
    // Learned: on the first page later, it is no arrival either.
    expect(poll([[makeOrder(0)]])).toEqual([]);
  });

  test("the first read of another tab or search only learns, then announces what comes after", () => {
    setup();

    expect(
      recordOrderList({ status: "packed" }, [[makeOrder(9, "packed")]], AT)
    ).toEqual([]);
    expect(recordOrderList({ q: "ana" }, [[makeOrder(8)]], AT)).toEqual([]);
    expect(
      recordOrderList({ q: "ana" }, [[makeOrder(10), makeOrder(8)]], AT)
    ).toEqual([makeOrder(10)]);
  });

  test("an order known from one list is no arrival in another", () => {
    setup();
    recordOrderList({}, [[makeOrder(1)]], AT);

    expect(recordOrderList({}, [[makeOrder(2), makeOrder(1)]], AT)).toEqual([]);
  });

  test("an arrival no longer received stops being new", () => {
    const { listener, poll } = setup();
    poll([[makeOrder(3), makeOrder(2)]]);
    listener.mockClear();

    poll([[makeOrder(3, "packed"), makeOrder(2, "packed")]]);

    expect(freshArrivals()).toEqual(new Map());
    expect(listener).toHaveBeenCalledExactlyOnceWith();
  });

  test("a read that changes nothing tells no one", () => {
    const { listener, poll } = setup();

    poll([[makeOrder(2, "packed"), makeOrder(1)]]);

    expect(listener).not.toHaveBeenCalled();
  });

  test("an unsubscribed listener hears nothing more", () => {
    const { listener, poll, unsubscribe } = setup();
    unsubscribe();

    poll([[makeOrder(3)]]);

    expect(listener).not.toHaveBeenCalled();
  });

  test("an older order the first page brings up when one above it leaves is no arrival", () => {
    const { listener, poll } = setup();

    // Order 2 was packed: order 0, only past the page's end until now,
    // comes up into it.
    expect(poll([[makeOrder(1), makeOrder(0)]])).toEqual([]);
    expect(freshArrivals()).toBe(NO_ARRIVALS);
    expect(listener).not.toHaveBeenCalled();
  });

  test("the list remembers the newest it showed, not the newest still on it", () => {
    const { poll } = setup();
    // Order 2, the newest it showed, leaves the list; then an order placed
    // between 1 and 2 that this tab never saw (moved back from packed by
    // someone else) comes in: older than what the list showed, no arrival.
    poll([[makeOrder(1)]]);
    const movedBack = makeOrder(7, "received", new Date(AT - 3_598_500));

    expect(poll([[movedBack, makeOrder(1)]])).toEqual([]);
    expect(poll([[makeOrder(3), movedBack, makeOrder(1)]])).toEqual([
      makeOrder(3),
    ]);
  });

  test.each([
    ["a later stamp", makeOrder(9, "received", new Date(AT + 1)), [9]],
    [
      "the same stamp and a higher id",
      makeOrder(6, "received", new Date(AT)),
      [6],
    ],
    [
      "the same stamp and a lower id",
      makeOrder(4, "received", new Date(AT)),
      [],
    ],
    ["an earlier stamp", makeOrder(9, "received", new Date(AT - 1)), []],
  ] as const)(
    "against the newest order shown, one with %s is an arrival: %j",
    (_case, order, expected) => {
      recordOrderList({}, [[makeOrder(5, "received", new Date(AT))]], AT);

      expect(
        recordOrderList(
          {},
          [[order, makeOrder(5, "received", new Date(AT))]],
          AT
        ).map(({ id }) => id)
      ).toEqual(expected);
    }
  );

  test("after an empty first read, any order the list brings is an arrival", () => {
    recordOrderList({}, [[]], AT);

    expect(recordOrderList({}, [[makeOrder(1)]], AT)).toEqual([makeOrder(1)]);
  });

  test("an arrival that comes packed is said but not new, nor new once moved back to received", () => {
    recordOrderList({}, [[]], AT);
    // The screen reads the arrival inside its listener, so what counts is
    // what the store holds at the moment it is told, not afterwards.
    const seen: { arrival: ReturnType<typeof lastArrival>; fresh: number }[] =
      [];
    const unsubscribe = subscribeArrivals(() => {
      seen.push({
        arrival: lastArrival(),
        fresh: freshArrivals().size,
      });
    });

    expect(recordOrderList({}, [[makeOrder(1, "packed")]], AT)).toEqual([
      makeOrder(1, "packed"),
    ]);
    // Said to the screen, which announces and beeps it, though nothing is new.
    expect(seen).toEqual([{ arrival: { codes: ["C1"], seq: 1 }, fresh: 0 }]);

    recordOrderList({}, [[makeOrder(1)]], AT + 60_000);
    unsubscribe();

    expect(freshArrivals().size).toBe(0);
    expect(isFreshArrival(freshArrivals(), makeOrder(1), AT + 60_000)).toBe(
      false
    );
  });

  test("an empty read records nothing and announces nothing", () => {
    setup();

    expect(recordOrderList({ status: "received" }, [], AT)).toEqual([]);
  });
});

describe("markOrderSeen", () => {
  test("an opened arrival is no longer new, the others still are", () => {
    const { listener, poll } = setup();
    poll([[makeOrder(4), makeOrder(3), makeOrder(2)]]);
    listener.mockClear();

    markOrderSeen(3);

    expect([...freshArrivals()]).toEqual([[4, AT + 1000]]);
    expect(listener).toHaveBeenCalledExactlyOnceWith();
  });

  test("an order opened before any list read is known: never an arrival", () => {
    markOrderSeen(5);
    recordOrderList({}, [[makeOrder(1)]], AT);

    expect(recordOrderList({}, [[makeOrder(5), makeOrder(1)]], AT)).toEqual([]);
  });

  test("opening an order that was not new tells no one", () => {
    const { listener } = setup();

    markOrderSeen(1);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("isFreshArrival", () => {
  const fresh = new Map([[3, AT]]);

  test.each([
    ["just arrived", makeOrder(3), AT, true],
    [
      "a moment before ten minutes",
      makeOrder(3),
      AT + ARRIVAL_FRESH_MS - 1,
      true,
    ],
    ["at ten minutes", makeOrder(3), AT + ARRIVAL_FRESH_MS, false],
    ["no longer received", makeOrder(3, "packed"), AT, false],
    ["never an arrival", makeOrder(2), AT, false],
  ] as const)("%s: %j at %i is new: %s", (_case, order, now, expected) => {
    expect(isFreshArrival(fresh, order, now)).toBe(expected);
  });

  test("lasts ten minutes", () => {
    expect(ARRIVAL_FRESH_MS).toBe(600_000);
  });
});
