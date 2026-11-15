import { afterEach, describe, expect, test, vi } from "vitest";

import type { OrderStatus } from "@/lib/schemas/order";

import {
  ARRIVAL_FRESH_MS,
  forgetOrderArrivals,
  freshArrivals,
  isFreshArrival,
  markOrderSeen,
  NO_ARRIVALS,
  recordOrderList,
  subscribeArrivals,
} from "./order-arrivals";

afterEach(() => {
  forgetOrderArrivals();
});

const AT = Date.parse("2026-11-14T22:00:00.000Z");
const STORE = "lr-market";

function makeOrder(id: number, status: OrderStatus = "received") {
  return { code: `C${String(id)}`, id, status };
}

/** A store whose received list was read once, holding orders 1 and 2. */
function setup() {
  const listener = vi.fn<() => void>();
  const unsubscribe = subscribeArrivals(listener);
  const first = recordOrderList(
    STORE,
    { status: "received" },
    [[makeOrder(2), makeOrder(1)]],
    AT
  );

  return {
    first,
    listener,
    poll: (pages: ReturnType<typeof makeOrder>[][], now = AT + 1000) =>
      recordOrderList(STORE, { status: "received" }, pages, now),
    unsubscribe,
  };
}

describe("recordOrderList", () => {
  test("the first read of a list announces nothing and marks nothing new", () => {
    const { first, listener } = setup();

    expect(first).toEqual([]);
    expect(freshArrivals(STORE)).toBe(NO_ARRIVALS);
    expect(listener).not.toHaveBeenCalled();
  });

  test("an order a later read brings on its first page is an arrival, new from then", () => {
    const { listener, poll } = setup();

    expect(poll([[makeOrder(3), makeOrder(2), makeOrder(1)]])).toEqual([
      makeOrder(3),
    ]);
    expect([...freshArrivals(STORE)]).toEqual([[3, AT + 1000]]);
    expect(listener).toHaveBeenCalledExactlyOnceWith();
  });

  test("an arrival is said once: the next read of the same list is quiet", () => {
    const { listener, poll } = setup();
    poll([[makeOrder(3), makeOrder(2)]]);

    expect(poll([[makeOrder(3), makeOrder(2)]], AT + 2000)).toEqual([]);
    expect([...freshArrivals(STORE)]).toEqual([[3, AT + 1000]]);
    expect(listener).toHaveBeenCalledExactlyOnceWith();
  });

  test("older pages a later read brings (Load more) are learned, never announced", () => {
    const { poll } = setup();

    expect(poll([[makeOrder(2), makeOrder(1)], [makeOrder(0)]])).toEqual([]);
    expect(freshArrivals(STORE)).toBe(NO_ARRIVALS);
    // Learned: on the first page later, it is no arrival either.
    expect(poll([[makeOrder(0)]])).toEqual([]);
  });

  test("the first read of another tab or search only learns, then announces what comes after", () => {
    setup();

    expect(
      recordOrderList(
        STORE,
        { status: "packed" },
        [[makeOrder(9, "packed")]],
        AT
      )
    ).toEqual([]);
    expect(recordOrderList(STORE, { q: "ana" }, [[makeOrder(8)]], AT)).toEqual(
      []
    );
    expect(
      recordOrderList(STORE, { q: "ana" }, [[makeOrder(7), makeOrder(8)]], AT)
    ).toEqual([makeOrder(7)]);
  });

  test("an order known from one list is no arrival in another", () => {
    setup();
    recordOrderList(STORE, {}, [[makeOrder(2)]], AT);

    expect(
      recordOrderList(STORE, {}, [[makeOrder(1), makeOrder(2)]], AT)
    ).toEqual([]);
  });

  test("keeps each store apart", () => {
    const { poll } = setup();
    recordOrderList("tienda-demo", {}, [[makeOrder(40)]], AT);

    expect(recordOrderList("tienda-demo", {}, [[makeOrder(3)]], AT)).toEqual([
      makeOrder(3),
    ]);
    expect(poll([[makeOrder(40), makeOrder(2)]])).toEqual([makeOrder(40)]);
    expect([...freshArrivals("tienda-demo")]).toEqual([[3, AT]]);
  });

  test("an arrival no longer received stops being new", () => {
    const { listener, poll } = setup();
    poll([[makeOrder(3), makeOrder(2)]]);
    listener.mockClear();

    poll([[makeOrder(3, "packed"), makeOrder(2, "packed")]]);

    expect(freshArrivals(STORE)).toEqual(new Map());
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

  test("an empty read records nothing and announces nothing", () => {
    setup();

    expect(recordOrderList(STORE, { status: "received" }, [], AT)).toEqual([]);
  });
});

describe("markOrderSeen", () => {
  test("an opened arrival is no longer new, the others still are", () => {
    const { listener, poll } = setup();
    poll([[makeOrder(4), makeOrder(3), makeOrder(2)]]);
    listener.mockClear();

    markOrderSeen(STORE, 3);

    expect([...freshArrivals(STORE)]).toEqual([[4, AT + 1000]]);
    expect(listener).toHaveBeenCalledExactlyOnceWith();
  });

  test("an order opened before any list read is known: never an arrival", () => {
    markOrderSeen(STORE, 5);
    recordOrderList(STORE, {}, [[makeOrder(1)]], AT);

    expect(
      recordOrderList(STORE, {}, [[makeOrder(5), makeOrder(1)]], AT)
    ).toEqual([]);
  });

  test("opening an order that was not new tells no one", () => {
    const { listener } = setup();

    markOrderSeen(STORE, 1);

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
